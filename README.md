# Resend to Mailcow Proxy 🚀📫

Um proxy de alta disponibilidade em Node.js construído para contornar bloqueios da porta 25 (CGNAT, Provedores Residenciais, Starlink) em servidores de e-mail locais (self-hosted). 

Ele atua como uma ponte: recebe e-mails via [Resend Webhooks](https://resend.com), coloca as mensagens em uma fila persistente no disco (evitando perda de dados) e as injeta no seu servidor [Mailcow](https://mailcow.email/) local via SMTP.

## ⚠️ O Problema que este projeto resolve
Se você hospeda seu próprio servidor Mailcow em casa ou na empresa, já deve ter esbarrado no bloqueio da **porta 25** pelo seu provedor de internet. Isso impede que seu servidor receba e-mails de fora.
A solução padrão é usar o serviço de Inbound de terceiros (como a Resend). No entanto, a Resend envia esses e-mails recebidos via **Webhooks HTTP (JSON)**, enquanto o Mailcow só entende **SMTP**. 

**Este proxy faz a tradução simultânea entre HTTP e SMTP com tolerância a falhas.**

## ✨ Principais Funcionalidades
- **Zero Perda de Dados (Fila em Disco):** Se o seu Mailcow estiver reiniciando, o proxy guarda o e-mail no disco rígido (`/data/queue`) e tenta novamente de forma automática (backoff/retries).
- **Tratamento Completo de Anexos:** Baixa e processa arquivos anexos e mantém imagens inline (como logos de assinaturas) intactas usando tratamento de `CID`.
- **Segurança de Nível Profissional:** Validação de assinaturas criptográficas nativa (Svix) para garantir que apenas a Resend possa injetar e-mails no seu servidor.
- **Auditoria Local:** Gera um log automático em `CSV` com status de sucesso/falha de todos os e-mails recebidos.
- **Sem Dependências Pesadas:** Não requer Redis, RabbitMQ ou bancos de dados externos. Usa o próprio disco rígido para gerenciamento de filas.

## 🏗️ Arquitetura Recomendada
Internet -> Resend (Inbound) -> Webhook -> Cloudflare Tunnels -> Servidor Local (Porta 2070) -> Proxy Node.js -> Mailcow (Porta 25 Interna).

## 🚀 Como Instalar e Rodar

### 1. Clonar e Instalar Dependências
```bash
git clone [https://github.com/Fox13g/resend-to-mailcow-proxy.git](https://github.com/SEU_USUARIO/resend-to-mailcow-proxy.git)
cd resend-to-mailcow-proxy
npm install
