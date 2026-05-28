Resend to Mailcow Proxy 🚀📫

Um proxy de alta disponibilidade em Node.js construído para contornar bloqueios da porta 25 (CGNAT, Provedores Residenciais, Starlink) em servidores de e-mail locais (self-hosted).

Ele atua como uma ponte: recebe e-mails via Resend Webhooks, coloca as mensagens em uma fila persistente no disco (evitando perda de dados) e as injeta no seu servidor Mailcow local via SMTP.

⚠️ O Problema que este projeto resolve

Se você hospeda seu próprio servidor Mailcow em casa ou na empresa, já deve ter esbarrado no bloqueio da porta 25 pelo seu provedor de internet. Isso impede que seu servidor receba e-mails de fora.
A solução padrão é usar o serviço de Inbound de terceiros (como a Resend). No entanto, a Resend envia esses e-mails recebidos via Webhooks HTTP (JSON), enquanto o Mailcow só entende SMTP.

Este proxy faz a tradução simultânea entre HTTP e SMTP com tolerância a falhas.

✨ Principais Funcionalidades

Zero Perda de Dados (Fila em Disco): Se o seu Mailcow estiver offline, o proxy guarda o e-mail no disco rígido (/data/queue) e tenta novamente de forma automática (backoff/retries).

Tratamento Completo de Anexos: Baixa e processa anexos, mantendo imagens inline (logos de assinatura) intactas.

Segurança de Nível Profissional: Validação de assinaturas criptográficas nativa (Svix) para garantir que apenas a Resend possa injetar e-mails no seu servidor.

Auditoria Local: Gera um log automático em CSV com status de sucesso/falha de todos os e-mails processados.

Leve: Não requer Redis, RabbitMQ ou bancos de dados externos. Usa o próprio disco rígido para gerenciamento de filas.

🏗️ Arquitetura Recomendada

Internet -> Resend (Inbound) -> Webhook -> Cloudflare Tunnels -> Servidor Local (Porta 2070) -> Proxy Node.js -> Mailcow (Porta 25 Interna).

🚀 Como Instalar e Rodar

1. Clonar e Instalar Dependências

git clone https://github.com/Fox13g/resend-to-mailcow-proxy.git
cd resend-to-mailcow-proxy
npm install


2. Configurar Variáveis de Ambiente

Crie um arquivo .env baseado no exemplo fornecido:

cp .env.example .env


Preencha as variáveis no arquivo .env:

RESEND_WEBHOOK_SECRET: A chave secreta fornecida pela Resend ao criar o Webhook.

RESEND_API_KEY: Sua API Key da Resend.

MAILCOW_HOST: IP do seu servidor Mailcow (geralmente 127.0.0.1 se estiver na mesma máquina).

3. Rodar em Produção (Recomendado usar PM2)

Para garantir que o serviço se mantenha ativo mesmo após o reinício do servidor:

sudo npm install -g pm2
pm2 start index.js --name "resend-to-mailcow-proxy"
pm2 save
pm2 startup


⚙️ Configuração Obrigatória no Mailcow (Aviso DMARC/SPF)

Para evitar que o Mailcow rejeite e-mails legítimos de bancos e serviços externos (devido ao DMARC/SPF), precisa autorizar o IP do seu proxy:

Aceda ao painel Admin do Mailcow.

Vá a Configuração > Configuração de Roteamento (Routing) > Anfitriões de Encaminhamento (Forwarding Hosts).

Adicione o IP de origem do proxy (ex: 127.0.0.1).

Marque a opção: "Desativar a verificação de Spam (Spam filter bypass)".

📁 Estrutura de Pastas

Ao executar, o script cria a pasta ./data/:

/queue/: E-mails a aguardar injeção no Mailcow.

/failed/: E-mails que falharam permanentemente (excederam limites de tentativas) para análise manual.

log_emails.csv: Histórico completo de transações.

📄 Licença

Distribuído sob a licença MIT.
