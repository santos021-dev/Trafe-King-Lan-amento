# Auditoria da lista de espera — Trafe King.

Data: 15/11/2026.

Pasta analisada e alterada, confirmada pelo usuário:
C:\Users\SUPORTE\Desktop\Trafe-King-site (1)\trafe-king-site

## Resultado

Implementação concluída e testada localmente. A operação pública ainda depende da configuração dos serviços e do teste com banco hospedado e remetente real. Nenhuma publicação, campanha ou mensagem real de e-mail foi executada neste trabalho.

## PRONTO

- POST /api/lista-de-espera valida name/email, grava cadastro e job de confirmação na mesma transação PostgreSQL e só então retorna {"ok":true}.
- Campos name, email, createdAt, consentAt, consentVersion e status=active implementados.
- E-mail normalizado, UNIQUE no banco e duplicidade sem nova inscrição, alteração de nome ou novo job.
- Integração Resend exclusivamente no servidor, com HTML da identidade dark/verde e texto puro.
- Fila persistente, retomada, exclusão mútua, payload estável e idempotência.
- Descadastro por link assinado, confirmação por POST e suporte one-click.
- Webhook de bounce/reclamação com verificação de assinatura e timestamp.
- Canal operacional de privacidade gerado a partir de PRIVACY_EMAIL.
- Futuro lançamento restrito ao operador, com prévia, confirmação explícita, snapshot dos ativos e processamento em lotes. Cron nunca envia lançamento.
- Build Vercel e servidor local que não publicam fontes de backend ou variáveis.
- Guia SETUP-EMAIL.md com configuração, consultas, comandos e teste completo.

## Preservação do projeto

Foram calculados hashes dos 32 arquivos originais antes das alterações.

Somente 3 arquivos originais mudaram:

1. index.html
2. assets/js/lista.js
3. privacidade/index.html

Nenhum arquivo original foi removido. Todos os CSS, imagens, favicon, fontes e demais JavaScripts, incluindo Firebase, autenticação, comunidade, menus, carrossel, transições e princípios, permaneceram byte a byte iguais. A alteração na página de privacidade ficou restrita aos trechos afetados pela lista e à data/versão correspondente.

Cópia de segurança local anterior:
C:\Users\SUPORTE\AppData\Local\Temp\trafe-king-before-lDWUtZ

Esse backup é temporário; não substitui versionamento nem backup do banco.

## TESTE — evidências obtidas

### Testes automatizados

npm test: **49 testes aprovados, 0 falhas**.

- O SQL foi executado em PostgreSQL embutido/PGlite isolado para teste.
- O front-end foi executado em DOM/JSDOM e integrado ao handler real e ao SQL.
- O transporte de e-mail externo foi substituído somente nos testes. Os testes não provam entrega no Resend ou em uma caixa postal.
- A implementação de produção usa pg/PostgreSQL; PGlite e JSDOM são devDependencies e não são usados para inscrições reais.

Cobertura: campos vazios/inválidos/grandes, JSON malformado, honeypot, origem, método, tamanho, erro seguro, rollback, unicidade, concorrência, rate limiting, descadastro, não reativação, worker, recuperação, idempotência expirada, campanha, assinatura de webhook, reclamação recebida antes do ID de envio, falta de credenciais, falha após commit e ausência de sucesso prematuro.

### Verificação do navegador

O site local foi aberto em navegador real. O formulário foi preenchido e enviado ao servidor local. Como não há .env.local configurado, a resposta real foi 503/not_configured e a interface mostrou:

“A lista de espera está temporariamente indisponível. Não foi possível confirmar o cadastro.”

Os campos foram preservados, o botão foi liberado e nenhuma confirmação falsa apareceu. O console observado não apresentou erros JavaScript. Uma captura foi registrada para a entrega ao usuário.

### HTTP local e arquivos públicos

| Recurso | Resultado |
| --- | --- |
| / | 200 |
| /assets/js/lista.js | 200 |
| /privacidade/ | 200 |
| /descadastro/ | 200 |
| GET /api/lista-de-espera | 405 |
| POST /api/lista-de-espera sem configuração | 503, mensagem segura |
| /server/db.js | 404 |
| /.env.local | 404 |
| /package.json | 404 |
| /migrations/001_waitlist.sql | 404 |

npm run build concluiu. O diretório público gerado contém 34 arquivos; não contém server/, api/, scripts/, migrations/, tests/, node_modules ou .env. A busca por nomes de variáveis privadas e assinatura de segredo nos arquivos públicos HTML/CSS/JS não encontrou ocorrências.

A sintaxe dos arquivos de servidor, scripts e testes foi verificada. A instalação com versões fixadas e lockfile concluiu com auditoria npm de 0 vulnerabilidades conhecidas naquela execução.

## SEGURANÇA

- Validação no servidor e corpo de até 4 KiB.
- Consultas parametrizadas e transação para inscrição/fila.
- Constraint única por e-mail e nenhuma lista pública de inscritos.
- Limites persistentes por IP/e-mail e teto global, com Retry-After.
- Honeypot invisível e verificação de origem.
- HMAC para identificadores dos contadores e assinatura do descadastro.
- Segredos somente no servidor, .env excluído e allowlist de arquivos públicos.
- TLS com validação de certificado para banco e provedor.
- Credencial Bearer para o processador, assinatura para webhook e comandos administrativos fora do navegador.
- Respostas/registro de falhas sem mensagens brutas de SQL/provedor, credenciais, dados pessoais ou stack traces.
- Tratamento de envio incerto: revisão manual em vez de repetição automática fora da janela de idempotência.

## PRECISA CONFIGURAR

1. Projeto na Vercel e domínio canônico HTTPS.
2. Banco PostgreSQL/Neon, região, usuário de execução com acesso restrito e migrações.
3. Variáveis do .env.example nos ambientes corretos.
4. Conta/domínio verificado no Resend, EMAIL_FROM e caixa monitorada PRIVACY_EMAIL.
5. SPF/DKIM/DMARC, chave de envio e webhook de bounce/reclamação.
6. Agendamento de 5 minutos compatível com o plano ou agendador externo autenticado. O cron configurado não é aceito no plano Hobby, que limita a frequência a diária.
7. Retenção, backups e controle de acesso nos fornecedores.
8. Teste real após o deploy: cadastro → consulta no banco → ID do Resend → entrega na caixa postal → descadastro.

Esses itens não puderam ser confirmados porque o projeto não contém credenciais, conexão de banco ou configuração de deploy. Não foi criado nenhum segredo real nem um serviço externo fictício.

O passo a passo executável está na seção 7 de SETUP-EMAIL.md. Os comandos de lançamento estão na seção 9 e devem ser usados somente quando a plataforma for lançada.
