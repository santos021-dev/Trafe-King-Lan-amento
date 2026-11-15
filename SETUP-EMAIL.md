# Lista de espera da Trafe King. — configuração e operação

Implementação de 15/11/2026. Trabalhamos na pasta anexada e confirmada pelo usuário:
C:\Users\SUPORTE\Desktop\Trafe-King-site (1)\trafe-king-site

## 1. O que foi preservado e o que mudou

O site era estático, sem package.json, backend, banco ou configuração de deploy. A solução conserva HTML/CSS/JS, identidade, imagens, fonte, favicon, menus, animações e os arquivos de Firebase/autenticação/comunidade. A lista usa um banco separado; não inicializa nem substitui o Firebase futuro.

Arquivos existentes alterados:

- index.html: método seguro no formulário, honeypot invisível, versão do consentimento, link de privacidade e botão liberado pelo JavaScript.
- assets/js/lista.js: envio com timeout, prevenção de submissão simultânea, acessibilidade, tratamento seguro de erros e sucesso somente após confirmação da API. O diálogo de regras foi preservado.
- privacidade/index.html: atualização somente do estado da lista, consentimento, tratamento dos dados e canal de atendimento. Sem empresa, endereço ou CNPJ inventados.

Arquivos criados:

| Arquivos | Finalidade |
| --- | --- |
| package.json, package-lock.json | Node 24, dependências fixadas e comandos |
| vercel.json | Functions, build público, headers e cron de confirmação |
| .env.example, .gitignore, .vercelignore | Configuração sem credenciais e exclusões |
| api/lista-de-espera.js | POST de inscrição |
| api/descadastro.js | POST de descadastro e one-click |
| api/privacidade.js | Contato operacional configurado no servidor |
| api/processar-emails.js | Processador autenticado, somente confirmações |
| api/resend-webhook.js | Assinatura e tratamento de bounce/reclamação |
| server/config.js, server/http.js | Configuração, validação e respostas seguras |
| server/db.js, server/subscriptions.js | PostgreSQL, transações, duplicidade e limites |
| server/email.js, server/worker.js | Templates, assinatura de descadastro e fila |
| migrations/001_waitlist.sql, migrations/002_delivery_events.sql | Estrutura privada de dados |
| scripts/build.mjs, scripts/dev.mjs, scripts/admin.mjs | Build, desenvolvimento e operação |
| descadastro/index.html, assets/js/descadastro.js | Cancelamento acessível dos avisos |
| tests/helpers.mjs, tests/backend.test.mjs, tests/frontend.test.mjs | Testes isolados |
| README.md, SETUP-EMAIL.md, docs/AUDITORIA-LISTA-DE-ESPERA.md | Instruções e auditoria |

A pasta dist é gerada pelo build, não é outra versão para editar. Somente os arquivos públicos expressamente permitidos entram nela. Código de servidor, banco, testes, dependências e .env não são publicados como arquivos estáticos.

## 2. Serviços necessários

- Vercel para servir o site e executar as cinco Functions Node.js.
- PostgreSQL, preferencialmente Neon, com conexão pooled e TLS. Nenhum arquivo JSON local é usado para armazenar inscrições.
- Resend para enviar confirmação e, futuramente, lançamento.
- Domínio sob seu controle, remetente verificado e uma caixa real monitorada para privacidade.

As APIs de e-mail são chamadas apenas pelo servidor. A integração usa HTTPS com a API oficial do Resend; o transporte tem timeout e chave de idempotência. Não há envio de anúncio durante a configuração, build, migração ou execução dos testes.

Crie bancos/branches distintos para desenvolvimento, preview e produção. Nunca direcione os testes de desenvolvimento a uma lista de produção.

## 3. Variáveis de ambiente

Em desenvolvimento: .env.local na raiz, a partir de .env.example. Na Vercel: abra o projeto → Settings → Environment Variables e selecione o ambiente correto. Marque credenciais como segredo e faça novo deploy após alterá-las. Não use prefixos NEXT_PUBLIC_, VITE_ ou injeção em HTML.

| Variável | Obrigatória | Configuração |
| --- | --- | --- |
| DATABASE_URL | Para cadastrar | URL PostgreSQL do banco; em produção, pooled/Neon com TLS |
| DATABASE_MIGRATION_URL | Opcional, apenas operador | Conexão com permissão de DDL para migrações; não precisa ser cadastrada na Vercel |
| SITE_URL | Sim | Origem canônica, por exemplo https://seu-dominio.com, sem subpasta, query ou fragmento |
| PRIVACY_EMAIL | Sim | Caixa existente e monitorada; exibida no canal de privacidade e usada como Reply-To |
| RATE_LIMIT_SECRET | Sim | Segredo aleatório de pelo menos 32 caracteres para proteger identificadores dos limites |
| UNSUBSCRIBE_SECRET | Sim | Outro segredo de pelo menos 32 caracteres para assinar links de descadastro |
| CRON_SECRET | Para o processador | Terceiro segredo de pelo menos 32 caracteres; Vercel envia Authorization: Bearer |
| EMAIL_ENABLED | Sim, para habilitar envio | true após configurar e testar Resend; false conserva os cadastros e a fila sem enviar |
| RESEND_API_KEY | Quando EMAIL_ENABLED=true | Chave de envio criada no Resend, restrita ao domínio quando possível |
| EMAIL_FROM | Quando EMAIL_ENABLED=true | Exemplo de formato: Trafe King. <avisos@seu-dominio.com> |
| RESEND_WEBHOOK_SECRET | Para bounces/reclamações | Signing secret fornecido pelo webhook do Resend |
| LAUNCH_ENABLED | Apenas no lançamento | false normalmente; true somente para operador enviar a campanha aprovada |
| DATABASE_ALLOW_INSECURE_LOCAL | Opcional | true só para PostgreSQL local sem TLS; bloqueado em produção/Vercel |
| PORT | Opcional, desenvolvimento | 3000 por padrão |

VERCEL e NODE_ENV são variáveis do ambiente/runtime. Não simule VERCEL=1 em outro provedor: ela define a confiança no IP encaminhado pela borda.

Para gerar cada um dos três segredos, execute este comando três vezes e guarde cada resultado somente no gerenciador de segredos/.env.local. Não cole os resultados no chat, nos arquivos públicos nem no Git:

~~~powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
~~~

Mantenha UNSUBSCRIBE_SECRET estável para preservar links enviados. Se precisar trocá-lo por comprometimento, os links antigos deixam de funcionar; mantenha o canal de privacidade operacional para atender os titulares. Use segredos distintos para cada finalidade.

## 4. Banco e migrações

1. Crie o banco/branch no Neon, escolhendo região próxima à Function.
2. Copie a connection string pooled para DATABASE_URL em .env.local. O driver verifica o certificado TLS.
3. Use uma credencial administrativa em DATABASE_MIGRATION_URL para aplicar a estrutura.
4. No PowerShell, execute:

~~~powershell
Set-Location -LiteralPath 'C:\Users\SUPORTE\Desktop\Trafe-King-site (1)\trafe-king-site'
npm ci
npm run db:migrate
~~~

A migração usa transação, trava e checksums. Executá-la novamente não duplica tabelas nem cadastros. Não edite migrações já aplicadas: adicione uma nova.

O schema waitlist é privado, sem acesso PUBLIC. O banco não é consultado pelo navegador. Os campos pedidos são armazenados como:

| Campo | Coluna SQL |
| --- | --- |
| name | name |
| email | email, único e normalizado em minúsculas |
| createdAt | created_at, gerado no servidor |
| consentAt | consent_at, gerado no servidor |
| consentVersion | consent_version, atualmente 2026-11-15.v1 |
| status | status, inicialmente active |

Há também ID interno, registro do descadastro, fila de e-mails, campanhas e contadores. A mensagem e versão de consentimento correspondentes estão no formulário e na política. Ao mudar a finalidade, revise o texto e incremente a versão; não reutilize automaticamente o consentimento anterior.

Para produção, crie um usuário separado para o aplicativo usando o painel/administrador do banco e conceda somente as permissões abaixo. Substitua trafe_king_app pelo nome real do papel criado; as senhas são configuradas no provedor, não neste arquivo:

~~~sql
GRANT USAGE ON SCHEMA waitlist TO trafe_king_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  waitlist.subscribers,
  waitlist.email_jobs,
  waitlist.campaigns,
  waitlist.rate_limits,
  waitlist.worker_locks,
  waitlist.delivery_events
TO trafe_king_app;
~~~

Coloque a conexão desse usuário em DATABASE_URL da Vercel. Não conceda DDL, superusuário ou acesso ao schema de outras funcionalidades. Configure backups e retenção no provedor conforme a necessidade real do projeto.

## 5. Domínio, remetente e entrega no Resend

1. Em Resend → Domains, adicione um domínio/subdomínio que você controla.
2. No DNS do domínio, copie exatamente os registros SPF/DKIM e demais registros mostrados pelo Resend. Não invente os valores nem crie registros SPF conflitantes.
3. Aguarde o domínio ficar verificado.
4. Configure EMAIL_FROM com um endereço desse domínio.
5. Configure PRIVACY_EMAIL com uma caixa que recebe respostas. Autorizar um remetente no Resend não cria uma caixa de entrada.
6. Crie a API key de envio, registre RESEND_API_KEY somente no servidor e habilite EMAIL_ENABLED=true.
7. Configure DMARC de acordo com seu provedor de DNS e demais serviços de e-mail; valide alinhamento SPF/DKIM antes de políticas restritivas.
8. Desative rastreamento de abertura/clique se não houver necessidade e informação apropriada na política.
9. Faça testes com uma caixa sua, verifique os cabeçalhos e a pasta de spam. A autenticação do domínio melhora a entrega, mas nenhum código garante caixa de entrada.

As mensagens são individuais, têm HTML dark com o verde da marca e versão de texto puro. Não expõem a lista de destinatários em CC/BCC.

Configure também Resend → Webhooks:

- URL: https://seu-dominio.com/api/resend-webhook
- Eventos: email.bounced e email.complained
- Copie o signing secret para RESEND_WEBHOOK_SECRET e faça novo deploy.

A assinatura é validada sobre o corpo original, com verificação de tempo. Eventos válidos marcam o inscrito como bounced/complained e impedem novos envios. O sistema também trata o caso em que o webhook chega antes da gravação do ID retornado pelo Resend. Entrega efetiva é acompanhada no painel do Resend; state=sent no banco significa aceitação pelo provedor.

## 6. Publicação na Vercel

1. Importe esta pasta/projeto, com package.json e api/ na raiz. Não importe só dist.
2. Framework preset: Other. Node.js: 24.x.
3. Build: npm run build. Output Directory: dist. Install: npm ci.
4. Cadastre as variáveis de produção. SITE_URL deve ser a origem real por onde o usuário acessará o formulário.
5. Aponte o domínio para o projeto e redirecione aliases, como www, para a origem canônica. Para preview, configure sua própria SITE_URL e banco de teste.
6. Execute as migrações no banco correto antes de liberar cadastros.
7. Faça deploy e execute o roteiro de teste abaixo.

vercel.json agenda /api/processar-emails a cada 5 minutos. Essa frequência exige plano compatível, atualmente Pro/Enterprise. O Hobby permite somente um cron diário e rejeita este agendamento no deploy. Se usar outro agendador, remova a chave crons de vercel.json e configure nele uma chamada HTTPS a cada 5 minutos, com Authorization: Bearer CRON_SECRET. Não envie o segredo na query string.

Não troque simplesmente o cron por uma vez ao dia: isso atrasa a fila e pode ultrapassar a janela segura de repetição do Resend. Escolha e valide uma solução de agendamento antes de considerar a operação pronta.

O cron processa apenas confirmações. Não pode ser convertido em disparador de lançamento por parâmetro de URL ou corpo. Sem CRON_SECRET válido, retorna 401. A autenticação do agendador deve continuar funcionando se você ativar Deployment Protection.

Após uma inscrição, waitUntil tenta processar a fila em segundo plano. A fila persiste no PostgreSQL caso a Function pare, o provedor falhe ou outro worker esteja ocupado. Cada rodada processa no máximo 10 mensagens e respeita exclusão mútua e espaçamento de chamadas. Monitore backlog e quotas antes de aumentar volume.

O servidor scripts/dev.mjs é exclusivo para localhost. Para hospedar fora da Vercel, adapte a entrada e a origem confiável do IP no servidor; não coloque o servidor de desenvolvimento diretamente na internet.

## 7. Teste exato da inscrição e da confirmação

Primeiro configure banco, variáveis, domínio/remetente e faça a migração. Use uma caixa de e-mail que é sua.

Para teste local:

~~~powershell
npm test
npm run dev
~~~

Em .env.local, SITE_URL deve ser http://localhost:3000. Abra esse endereço exato. Para testar links recebidos localmente, abra o e-mail no mesmo computador. No site publicado, SITE_URL usa HTTPS e o domínio público.

1. Abra o site e vá a “Seja um dos primeiros”.
2. Informe “Teste Samuel” e o seu e-mail real.
3. Clique em “Quero ser avisado”.
4. Nas ferramentas do navegador → Network/Rede, confira POST /api/lista-de-espera, HTTP 200 e {"ok":true}. O sucesso só deve aparecer após essa resposta.
5. No terminal, com .env.local apontando para o banco que recebeu o teste, execute:

~~~powershell
npm run waitlist:inspect -- --email=SEU_EMAIL_REAL
~~~

6. A saída deve conter exatamente um registro, nome, e-mail, createdAt, consentAt, consentVersion=2026-11-15.v1 e status=active.
7. Em emails, confira kind=confirmation. Quando o Resend aceitar, state será sent e providerId será preenchido.
8. Em Resend → Emails, procure o ID retornado. Verifique o status de entrega e depois a caixa de entrada/spam.
9. Se estiver pending, confira EMAIL_ENABLED, credenciais e cron. Para processar manualmente somente as confirmações:

~~~powershell
npm run email:worker -- --kind=confirmation --send
~~~

10. Repita a inscrição com o mesmo e-mail, inclusive mudando maiúsculas/minúsculas. Deve continuar existindo um registro e um único e-mail de confirmação na fila. Não há atualização não autenticada do nome/consentimento.
11. No e-mail recebido, clique em “Cancelar os avisos” e confirme. Consulte novamente: status deve ser unsubscribed.
12. Repetir o formulário não reativa um descadastrado. A resposta pública é igual para preservar privacidade, e o texto não promete reativação.
13. Teste em banco/preview separado a ausência de configuração: remova DATABASE_URL, reinicie ou refaça o deploy e envie. Deve ocorrer 503 com erro seguro e sem sucesso visual. Restaure a configuração depois.
14. Teste nome/e-mail inválidos e mais de 5 tentativas em 15 minutos: deve haver rejeição, incluindo 429 e Retry-After no limite.

Também é possível verificar pelo SQL Editor do Neon, substituindo o endereço abaixo pelo seu e-mail de teste:

~~~sql
SELECT name, email, created_at AS "createdAt",
       consent_at AS "consentAt", consent_version AS "consentVersion", status
FROM waitlist.subscribers
WHERE email = lower('SEU_EMAIL_REAL');

SELECT j.id, j.kind, j.state, j.attempts, j.provider_id, j.last_error_code
FROM waitlist.email_jobs j
JOIN waitlist.subscribers s ON s.id = j.subscriber_id
WHERE s.email = lower('SEU_EMAIL_REAL');
~~~

Não publique prints dessas consultas com dados de outras pessoas. Um HTTP 200 comprova o cadastro; não comprova que o provedor entregou o e-mail. Uma falha de rede pode acontecer após o commit: a interface informa que não conseguiu confirmar e permite tentar novamente sem duplicação.

## 8. Contrato da API

POST /api/lista-de-espera, Content-Type: application/json:

~~~json
{
  "name": "Nome da pessoa",
  "email": "pessoa@example.com",
  "website": "",
  "consentVersion": "2026-11-15.v1"
}
~~~

name e email são obrigatórios. website é o honeypot e precisa estar vazio. O formulário envia a versão do consentimento; chamadas com somente name/email continuam compatíveis e usam a versão atual do servidor. Uma versão explicitamente incorreta é rejeitada.

- 200: {"ok":true}, inscrição gravada ou endereço já registrado, sem expor seu status.
- 400: campos/JSON inválidos, honeypot preenchido ou consentimento desatualizado.
- 403: origem não permitida.
- 405: método não permitido.
- 408: leitura do corpo excedeu o tempo permitido.
- 413: corpo maior que 4 KiB.
- 415: mídia/codificação incompatível.
- 429: limite excedido, com Retry-After.
- 503: serviço/configuração indisponível; mensagem genérica.

Nomes têm até 80 caracteres; e-mails até 254, com parte local até 64. São aceitos endereços ASCII comuns, incluindo +. Domínios internacionalizados precisam estar em punycode. Campos inesperados, controles, nomes com marcação HTML, arrays e objetos no lugar de strings são rejeitados.

## 9. Disparo de lançamento — somente no futuro

Não foi enviado nenhum anúncio. O cron não envia lançamentos. O HTML/texto da mensagem está em server/email.js, separado da confirmação.

Quando a plataforma estiver de fato lançada:

1. Revise o conteúdo da mensagem e o link SITE_URL.
2. Confira descadastros, bounces e reclamações, quotas do Resend e a fila de confirmação.
3. Escolha um identificador estável de campanha. Nunca invente um novo ID só para repetir um comando.
4. Visualize o público (somente leitura, sem enfileirar nem enviar):

~~~powershell
npm run launch -- --campaign=lancamento-v1
~~~

5. Somente no ambiente do operador, habilite LAUNCH_ENABLED=true e EMAIL_ENABLED=true. As credenciais devem apontar para o banco e remetente corretos.
6. Crie a fila de ativos naquele momento:

~~~powershell
npm run launch -- --campaign=lancamento-v1 --enqueue --confirm=lancamento-v1
~~~

7. Envie um lote de até 10 mensagens:

~~~powershell
npm run email:worker -- --kind=launch --campaign=lancamento-v1 --confirm=lancamento-v1 --send
~~~

8. Verifique os resultados e repita esse último comando até concluir. Envios já aceitos não são repetidos. Descadastros ocorridos depois de enfileirar são verificados novamente antes de cada envio.
9. Desabilite LAUNCH_ENABLED ao terminar.

A campanha é um snapshot: repetir o enfileiramento com o mesmo identificador não inclui pessoas novas nem duplica registros. Um e-mail que já entrou no processamento externo pode chegar mesmo após descadastro. Não prometa cancelamento retroativo de uma mensagem entregue ao provedor.

A conta do Resend pode ser compartilhada com outros sistemas; ajuste quotas e ritmo conjuntamente. A trava coordena apenas este projeto. Não coloque essas operações em botão público nem no JavaScript do site.

## 10. Falhas, operação e privacidade

Em falhas transitórias, a fila aguarda novas rodadas com intervalo progressivo. O payload e a chave são preservados. Após 8 tentativas, erro permanente ou resultado incerto com mais de 23 horas, o job vai para review. O Resend guarda chaves de idempotência por 24 horas; não seria seguro reenviar automaticamente depois desse período.

~~~powershell
npm run email:review
~~~

Verifique o resultado no Resend antes de reconciliar. Se confirmou que foi enviado:

~~~powershell
npm run email:review -- --job=UUID_DO_JOB --provider-id=ID_CONFIRMADO_NO_RESEND --confirm=sent
~~~

Somente se confirmou que NÃO houve envio, corrija a causa e permita uma nova tentativa:

~~~powershell
npm run email:review -- --job=UUID_DO_JOB --confirm=retry-unsent
~~~

Este comando só altera a fila; o worker fará a próxima tentativa. Nunca reative às cegas resultados incertos.

Para atender remoção solicitada, valide a identidade por um canal apropriado e execute, em ambiente administrativo:

~~~powershell
npm run waitlist:remove -- --email=EMAIL_VERIFICADO --confirm=remove
~~~

A operação exclui o cadastro e seus jobs por cascata. Descadastro e exclusão são operações diferentes. Analise também retenção de logs, backups e registros no Resend/Neon, que dependem das configurações dos fornecedores. Não foi inventado um prazo jurídico de retenção.

Monitore no banco:

~~~sql
SELECT status, count(*) FROM waitlist.subscribers GROUP BY status;
SELECT kind, state, count(*) FROM waitlist.email_jobs GROUP BY kind, state;
SELECT min(created_at) FROM waitlist.email_jobs WHERE state = 'pending';
~~~

Logs da aplicação registram apenas eventos e identificadores técnicos, sem nomes, e-mails, chaves ou erros brutos do driver. Configure também a retenção/acesso dos logs da hospedagem. Links one-click contêm um token específico de descadastro; não registre query strings completas nem compartilhe esses links. O link normal usa fragmento, removido do histórico pela página.

## 11. Segurança implementada e limites conhecidos

- Validação independente no servidor, normalização, limite de 4 KiB e leitura com timeout.
- SQL parametrizado, transações, UNIQUE e schema privado.
- Rate limiting compartilhado no PostgreSQL: 5 tentativas por IP/15 min, 3 por e-mail/hora e teto de 500 inscrições/hora. Não depende da memória de uma Function.
- Contadores usam HMAC; a aplicação não grava o IP original nesses contadores. Limpeza de expirados pelo worker.
- Honeypot e verificação de origem; sem CORS aberto. Origem sozinha não substitui proteção contra bots.
- E-mails duplicados não provocam outra confirmação e não reativam preferências canceladas.
- TLS com certificado validado, secrets só no servidor e build público por lista permitida.
- Token de descadastro assinado, POST para alterar o status e one-click compatível.
- Webhook autenticado com assinatura e timestamp; descadastros/reclamações respeitados.
- Processador com Bearer secret, fila durável, trava, retentativas controladas e lançamento apenas administrativo.
- Sem exibição de stack traces ou mensagens internas de fornecedores.

O honeypot e os limites reduzem abuso, mas não provam humanidade. Para tráfego hostil/distribuído, configure limites/WAF na borda e avalie Turnstile. Esta versão não carrega CAPTCHA nem rastreador de terceiros no navegador.

## 12. Referências oficiais consultadas

- [Vercel Functions Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [Variáveis de ambiente da Vercel](https://vercel.com/docs/environment-variables)
- [Limites de cron por plano](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
- [Conexão Node.js com Neon](https://neon.com/docs/guides/node)
- [API de envio do Resend](https://resend.com/docs/api-reference/emails/send-email)
- [Idempotência do Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Domínio verificado no Resend](https://resend.com/docs/dashboard/domains/introduction)
- [DMARC no Resend](https://resend.com/docs/dashboard/domains/dmarc)
- [Assinatura de webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)
