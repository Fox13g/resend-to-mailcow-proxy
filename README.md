Resend to Mailcow Proxy 🚀📫

Um proxy de alta disponibilidade em Node.js construído especificamente para contornar bloqueios da porta 25 (CGNAT, Provedores Residenciais, Starlink) em servidores de e-mail locais (self-hosted).

Ele atua como uma ponte: recebe e-mails via Resend Webhooks, coloca as mensagens em uma fila persistente no disco (evitando perda de dados) e as injeta no seu servidor Mailcow local via SMTP.
⚠️ O Problema que este projeto resolve

Se você hospeda seu próprio servidor Mailcow em casa ou na empresa, já deve ter esbarrado no bloqueio da porta 25 pelo seu provedor de internet. Isso impede que seu servidor receba e-mails de fora de forma direta.

A solução padrão é usar um serviço de Inbound de terceiros (como a Resend). No entanto, a Resend envia esses e-mails recebidos via Webhooks HTTP (JSON), enquanto o Mailcow só entende o protocolo SMTP.

    Este proxy faz a tradução simultânea entre HTTP e SMTP com altíssima tolerância a falhas.

✨ Principais Funcionalidades
Funcionalidade	Descrição
Zero Perda de Dados	Se o seu Mailcow estiver offline, o proxy guarda o e-mail no disco rígido (/data/queue) e tenta novamente de forma automática (backoff/retries).
Tratamento de Anexos	Baixa e processa anexos automaticamente, mantendo imagens inline (como logos de assinatura) intactas.
Segurança Profissional	Validação de assinaturas criptográficas nativa (Svix) para garantir que apenas a Resend possa injetar e-mails no seu servidor.
Auditoria Local	Gera um log automático em formato CSV com o status de sucesso ou falha de todos os e-mails processados.
Arquitetura Leve	Não requer Redis, RabbitMQ ou bancos de dados externos. Usa o próprio sistema de arquivos para o gerenciamento de filas.
🏗️ Arquitetura Recomendada
text

Internet ──> Resend (Inbound) ──> Webhook ──> Cloudflare Tunnels ──> Servidor Local (Porta 2070) ──> Proxy Node.js ──> Mailcow (Porta 25 Interna)

🚀 Como Instalar e Rodar
1. Clonar e Instalar Dependências
bash

git clone https://github.com/Fox13g/resend-to-mailcow-proxy.git
cd resend-to-mailcow-proxy
npm install

2. Configurar Variáveis de Ambiente

Crie um arquivo .env baseado no exemplo fornecido:
bash

cp .env.example .env

Abra o arquivo .env e preencha as seguintes variáveis:

    RESEND_WEBHOOK_SECRET: A chave secreta fornecida pela Resend ao criar o Webhook.

    RESEND_API_KEY: Sua API Key do painel da Resend.

    MAILCOW_HOST: IP do seu servidor Mailcow (geralmente 127.0.0.1 se estiver rodando na mesma máquina).

3. Rodar em Produção (Recomendado usar PM2)

Para garantir que o serviço se mantenha ativo mesmo após reinicializações do sistema:
bash

# Instalar o PM2 globalmente se não tiver
sudo npm install -g pm2

# Iniciar o proxy
pm2 start index.js --name "resend-to-mailcow-proxy"

# Configurar para iniciar com o sistema
pm2 save
pm2 startup

⚙️ Configuração Obrigatória no Mailcow (Aviso DMARC/SPF)

Para evitar que o Mailcow rejeite e-mails legítimos de bancos e serviços externos (devido às validações restritivas de DMARC/SPF), você precisa autorizar o IP do seu proxy:

    Acesse o painel Admin do Mailcow.

    Navegue até Configuração > Configuração de Roteamento (Routing) > Anfitriões de Encaminhamento (Forwarding Hosts).

    Adicione o IP de origem do proxy (ex: 127.0.0.1).

    Certifique-se de marcar a opção: "Desativar a verificação de Spam (Spam filter bypass)".

📁 Estrutura de Pastas

Ao executar o script pela primeira vez, ele criará automaticamente a pasta ./data/ com a seguinte estrutura de arquivos:

    /queue/: E-mails armazenados temporariamente aguardando injeção no Mailcow.

    /failed/: E-mails que falharam permanentemente (excederam o limite de tentativas) para análise manual posterior.

    log_emails.csv: Histórico detalhado de transações e envios.

📄 Licença

Este projeto é distribuído sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.
