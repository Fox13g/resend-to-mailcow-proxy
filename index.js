require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const { Webhook } = require('svix');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuração de Diretórios para a Fila Persistente
const DATA_DIR = path.join(__dirname, 'data');
const QUEUE_DIR = path.join(DATA_DIR, 'queue');
const FAILED_DIR = path.join(DATA_DIR, 'failed');
const CSV_FILE = path.join(DATA_DIR, 'log_emails.csv');

// Garantir que todas as pastas necessárias existem no boot
[QUEUE_DIR, FAILED_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configuração do Transporte para o Mailcow (Porta 25 Interna)
const transporter = nodemailer.createTransport({
    host: process.env.MAILCOW_HOST || '127.0.0.1',
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false },
    pool: true, // Mantém conexões SMTP abertas para maior performance
    maxConnections: 3
});

// Flag para evitar concorrência no processamento da fila
let isProcessingQueue = false;

// Configurações de Retentativa
const MAX_RETRIES = 5;

/**
 * Registra logs estruturados no padrão CSV (Compatível com Excel BR via ";")
 */
function salvarLogCSV(id, de, para, assunto, status, erro = '') {
    const agora = new Date();
    const dataBr = agora.toLocaleDateString('pt-BR');
    const horaBr = agora.toLocaleTimeString('pt-BR');

    if (!fs.existsSync(CSV_FILE)) {
        const header = "ID;Remetente;Destinatario;Assunto;Data;Hora;Status;Erro\n";
        fs.writeFileSync(CSV_FILE, header, 'utf8');
    }

    const assuntoLimpo = (assunto || "").replace(/"/g, "'").replace(/;/g, " ");
    const erroLimpo = (erro || "").replace(/"/g, "'").replace(/;/g, " ").replace(/\n/g, " ");
    const logLine = `"${id}";"${de}";"${para}";"${assuntoLimpo}";"${dataBr}";"${horaBr}";"${status}";"${erroLimpo}"\n`;

    fs.appendFileSync(CSV_FILE, logLine, 'utf8');
}

/**
 * ENDPOINT DO WEBHOOK: Focado puramente em velocidade e segurança.
 * Apenas valida e joga no disco rígido.
 */
app.post('/api/inbound', express.raw({ type: 'application/json' }), async (req, res) => {
    const payload = req.body.toString();
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
    let event;

    // 1. Validar a assinatura de segurança de forma estrita
    try {
        event = wh.verify(payload, req.headers);
    } catch (err) {
        console.error('⚠️ [Segurança] Assinatura do Webhook inválida rejeitada.');
        return res.status(400).send('Invalid signature');
    }

    // 2. Filtrar apenas eventos de recepção de e-mail
    if (event.type === 'email.received') {
        const emailId = event.data.email_id;
        const taskPath = path.join(QUEUE_DIR, `${emailId}.json`);

        // Evitar duplicidade física no disco se a Resend reenviar o webhook muito rápido
        if (!fs.existsSync(taskPath)) {
            const taskData = {
                emailId: emailId,
                eventData: event.data,
                attempts: 0,
                createdAt: new Date().toISOString()
            };

            // Grava o arquivo de forma síncrona/atômica para garantir persistência imediata
            fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf8');
            console.log(`📥 Fila: E-mail [${emailId}] salvo em disco com sucesso.`);
        }

        // Dispara o processador em background de forma assíncrona (não bloqueia a resposta HTTP)
        setImmediate(processQueue);

        // Responde imediatamente 200 OK para a Resend liberar a conexão
        return res.status(200).send('Accepted and Queued');
    }

    res.status(200).send('Event ignored');
});

/**
 * WORKER DE PROCESSAMENTO DA FILA (Executa em Background)
 */
async function processQueue() {
    if (isProcessingQueue) return; // Se já estiver rodando, evita execução paralela destrutiva
    isProcessingQueue = true;

    try {
        const files = fs.readdirSync(QUEUE_DIR).filter(file => file.endsWith('.json'));

        for (const file of files) {
            const filePath = path.join(QUEUE_DIR, file);

            // Proteção caso o arquivo tenha sido deletado por outra thread/loop
            if (!fs.existsSync(filePath)) continue;

            let task;
            try {
                task = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                // Arquivo corrompido ou mal escrito, remove para não travar a fila
                fs.unlinkSync(filePath);
                continue;
            }

            console.log(`🚀 Processando item da fila: ${task.emailId} (Tentativa ${task.attempts + 1}/${MAX_RETRIES})`);

            try {
                // 1. Buscar Corpo do E-mail na API HTTP da Resend
                const emailRes = await fetch(`https://api.resend.com/emails/receiving/${task.emailId}`, {
                    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
                });

                if (!emailRes.ok) throw new Error(`HTTP Error Resend API: ${emailRes.status}`);
                const emailData = await emailRes.json();

                if (!emailData || emailData.error) {
                    throw new Error(emailData?.error?.message || "Erro de dados na API Resend");
                }

                // 2. Buscar e Processar Anexos
                let attachments = [];
                if (task.eventData.attachments && task.eventData.attachments.length > 0) {
                    console.log(`📎 E-mail [${task.emailId}] possui ${task.eventData.attachments.length} anexo(s). Baixando...`);

                    for (const att of task.eventData.attachments) {
                        const attRes = await fetch(`https://api.resend.com/attachments/receiving/${att.id}?emailId=${task.emailId}`, {
                            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
                        });

                        if (!attRes.ok) throw new Error(`Falha ao baixar anexo ${att.id}`);
                        const attData = await attRes.json();

                        if (attData && attData.content) {
                            const cleanCid = att.content_id ? att.content_id.replace(/[<>]/g, '') : undefined;
                            attachments.push({
                                filename: att.filename,
                                content: Buffer.from(attData.content, 'base64'),
                                contentType: att.content_type,
                                cid: cleanCid,
                                contentDisposition: cleanCid ? 'inline' : 'attachment'
                            });
                        }
                    }
                }

                // 3. Injetar no Mailcow via SMTP Local
                // Prepara múltiplos destinatários (Trata arrays que vêm da Resend)
                const allTo = Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to;
                const allCc = Array.isArray(emailData.cc) ? emailData.cc.join(', ') : undefined;
                const allBcc = Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : undefined;

                await transporter.sendMail({
                    from: emailData.from,
                    to: allTo,
                    cc: allCc,
                    bcc: allBcc,
                    subject: emailData.subject || "Sem Assunto",
                    html: emailData.html || `<div style="white-space: pre-wrap;">${emailData.text || ''}</div>`,
                    text: emailData.text,
                    replyTo: emailData.reply_to || emailData.from,
                    attachments: attachments,
                    // Repassar o Message-ID é vital para manter o histórico de conversas (Threads) agrupado
                    messageId: emailData.message_id || undefined
                });

                // 4. Sucesso Absoluto: Registrar Log e remover arquivo da fila
                salvarLogCSV(task.emailId, emailData.from, allTo, emailData.subject, 'SUCESSO');
                fs.unlinkSync(filePath);
                console.log(`✅ E-mail [${task.emailId}] entregue com sucesso ao Mailcow.`);

            } catch (error) {
                console.error(`❌ Erro ao processar e-mail [${task.emailId}]:`, error.message);
                task.attempts += 1;

                if (task.attempts >= MAX_RETRIES) {
                    // Move para a pasta de falhas críticas para análise manual e não perder os dados
                    const failedPath = path.join(FAILED_DIR, file);
                    fs.writeFileSync(failedPath, JSON.stringify(task, null, 2), 'utf8');
                    fs.unlinkSync(filePath);

                    salvarLogCSV(task.emailId, task.eventData.from || 'Desconhecido', 'Erro', 'Falha Crítica', 'FALHA', error.message);
                    console.error(`💀 E-mail [${task.emailId}] excedeu o limite de tentativas. Movido para /failed.`);
                } else {
                    // Atualiza o arquivo com o novo número de tentativas para a próxima rodada
                    fs.writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf8');
                }
            }
        }
    } catch (globalError) {
        console.error('❌ Erro crítico no loop da fila:', globalError.message);
    } finally {
        isProcessingQueue = false;
    }
}

// Loop de Varredura Automática (A cada 30 segundos verifica se há itens órfãos na fila)
setInterval(processQueue, 30000);

const PORT = process.env.PORT || 2070;
app.listen(PORT, () => {
    console.log(`🚀 Proxy de Alta Disponibilidade rodando na porta ${PORT}`);
    console.log(`📂 Pasta de dados e logs em: ${DATA_DIR}`);
    // Varredura inicial ao ligar o servidor para limpar e-mails pendentes antes da queda
    setImmediate(processQueue);
});
