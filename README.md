# Trafe King.

Site existente em HTML, CSS e JavaScript, com lista de espera implementada em Node.js 24, PostgreSQL e Resend.

**A implementação foi concluída e testada localmente. Banco hospedado, domínio, credenciais, envio real e publicação ainda precisam ser configurados.** Não há autenticação, membros ou comunidade simulados. Nenhum anúncio de lançamento foi enviado.

Leia [SETUP-EMAIL.md](SETUP-EMAIL.md) para configurar, publicar e testar. O relatório do trabalho está em [docs/AUDITORIA-LISTA-DE-ESPERA.md](docs/AUDITORIA-LISTA-DE-ESPERA.md).

```powershell
npm ci
npm test
npm run build
```

Para trabalhar localmente, copie `.env.example` para `.env.local`, preencha as variáveis, execute `npm run db:migrate` e `npm run dev`. Sem configuração, a API responde com indisponibilidade e não finge gravar inscrições.

A raiz de publicação é esta pasta `trafe-king-site`, que contém `package.json`, `vercel.json`, `api/` e o HTML existente. Enviar somente `dist/` para uma hospedagem estática não executa o backend.

O formulário usa `POST /api/lista-de-espera` e só mostra confirmação após HTTP 200 com `{"ok":true}`. Inscrições e a fila de confirmação são gravadas na mesma transação. O processamento de e-mails é independente da confirmação do cadastro.
