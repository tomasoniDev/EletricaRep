# Relatórios de Atendimento Tomasoni

Aplicação corporativa para cadastro de máquinas, usuários, contratos, cronograma, acesso remoto e registros de atendimento.

## Stack

- Next.js
- Supabase via rotas server-side
- SMTP Office 365 para envio de relatórios
- Vercel

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `APP_SESSION_SECRET`.
3. Preencha as variáveis SMTP quando precisar testar envio de e-mail:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`
4. Instale dependências com `npm install`.
5. Rode `npm run dev`.

## Supabase

O navegador não acessa o Supabase diretamente. As consultas e gravações passam pelas rotas internas em `app/api`, com validação de sessão e permissões no servidor.

O schema inicial está em `supabase/migrations/001_initial_schema.sql`.

## E-mail

O envio automático de relatórios usa SMTP Office 365 pela rota `app/api/send-service-email`.

Em produção, as credenciais devem ficar apenas nas variáveis de ambiente da Vercel.
