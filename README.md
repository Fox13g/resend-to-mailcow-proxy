# resend-to-mailcow-proxy
A resilient Node.js proxy to bypass Port 25/CGNAT blocks. It receives inbound emails via Resend Webhooks and injects them safely into a local Mailcow server via SMTP using a persistent local queue.
