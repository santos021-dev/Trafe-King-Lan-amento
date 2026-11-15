import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import { database, env, request } from './helpers.mjs';
import { signup, unsubscribe, processEmails, privacyContact } from '../server/handlers.js';
import { saveSubscription, suppressSubscription, enqueueLaunch, consumeRate } from '../server/subscriptions.js';
import { getConfig, getEmailConfig, clientAddress } from '../server/config.js';
import { runWorker } from '../server/worker.js';
import { unsubscribeToken, verifyUnsubscribeToken, DeliveryError, sendWithResend } from '../server/email.js';
import { handleWebhook } from '../api/resend-webhook.js';
import signupRoute from '../api/lista-de-espera.js';
import unsubscribeRoute from '../api/descadastro.js';
import { CONSENT_VERSION } from '../server/http.js';

let db;
before(async () => { db = await database(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });
const run = req => signup(req, { db, env });
const emailConfig = () => getEmailConfig({ ...env, EMAIL_ENABLED:'true' });
const worker = extra => runWorker({ db, config:emailConfig(), pause:async () => {}, ...extra });
const saved = () => db.query('SELECT * FROM waitlist.subscribers');
const jobs = () => db.query('SELECT * FROM waitlist.email_jobs ORDER BY created_at');

test('POST grava dados normalizados, consentimento e confirmação de forma durável', async () => {
  const response = await run(request({ name:'  José   da Silva  ', email:'  TESTE@Example.com ' }));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(), {ok:true});
  const [row] = (await saved()).rows;
  assert.equal(row.name,'José da Silva'); assert.equal(row.email,'teste@example.com');
  assert.equal(row.status,'active'); assert.equal(row.consent_version,CONSENT_VERSION);
  assert.ok(row.created_at); assert.ok(row.consent_at);
  assert.equal((await jobs()).rows[0].state,'pending');
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('duplicados usam resposta igual e não sobrescrevem nome, consentimento ou criam outro job', async () => {
  await run(request());
  const beforeRow = (await saved()).rows[0];
  const response = await run(request({ name:'Outro nome', email:'TESTE@example.com' }));
  assert.deepEqual(await response.json(),{ok:true});
  assert.deepEqual((await saved()).rows,[beforeRow]); assert.equal((await jobs()).rows.length,1);
});

test('constraint UNIQUE impede duplicação em inscrições concorrentes', async () => {
  await Promise.all(Array.from({length:12}, () => saveSubscription(db,{ name:'Teste',email:'race@example.com' })));
  assert.equal((await saved()).rows.length,1); assert.equal((await jobs()).rows.length,1);
});

test('falha ao criar confirmação faz rollback da inscrição', async () => {
  const broken = { connect:async () => {
    const client = await db.connect();
    return { release:client.release, query:(sql, values) => {
      if (sql.startsWith('INSERT INTO waitlist.email_jobs')) throw new Error('private driver detail');
      return client.query(sql,values);
    }};
  }};
  await assert.rejects(saveSubscription(broken,{name:'Teste',email:'teste@example.com'}));
  assert.equal((await saved()).rows.length,0);
});

const invalid = [
  ['nome vazio',{name:' ',email:'teste@example.com'}],
  ['nome enorme',{name:'A'.repeat(81),email:'teste@example.com'}],
  ['nome objeto',{name:{value:'Teste'},email:'teste@example.com'}],
  ['HTML no nome',{name:'<script>test</script>',email:'teste@example.com'}],
  ['controle no nome',{name:'Teste\nEmail',email:'teste@example.com'}],
  ['e-mail vazio',{name:'Teste',email:''}],
  ['e-mail inválido',{name:'Teste',email:'a@invalid'}],
  ['domínio inválido',{name:'Teste',email:'a@-example.com'}],
  ['pontos repetidos',{name:'Teste',email:'a..b@example.com'}],
  ['e-mail enorme',{name:'Teste',email:'a'.repeat(255)+'@example.com'}],
  ['injeção de cabeçalho',{name:'Teste',email:'a@example.com\r\nBcc:x@example.com'}],
  ['campo desconhecido',{name:'Teste',email:'a@example.com',status:'active'}],
  ['honeypot',{name:'Teste',email:'a@example.com',website:'https://spam.example'}],
  ['versão desatualizada',{name:'Teste',email:'a@example.com',consentVersion:'old'}],
  ['array',[]], ['JSON nulo','null'], ['JSON malformado','{"name":']
];
for(const [label,body] of invalid) test('rejeita '+label+' sem persistir', async () => {
  const response = await run(request(body));
  assert.equal(response.status,400); assert.equal((await response.json()).ok,false);
  assert.equal((await saved()).rows.length,0);
});

test('limites de bytes com e sem Content-Length e tipo de mídia', async () => {
  assert.equal((await run(request('x'.repeat(4097)))).status,413);
  assert.equal((await run(request('{}',{'Content-Length':'99999'}))).status,413);
  assert.equal((await run(request('{}',{'Content-Type':'text/plain'}))).status,415);
  assert.equal((await run(request('{}',{'Content-Encoding':'gzip'}))).status,415);
});

test('origem externa e método indevido são rejeitados', async () => {
  assert.equal((await run(request(undefined,{Origin:'https://evil.example'}))).status,403);
  const response = await signupRoute.fetch(new Request(env.SITE_URL+'/api/lista-de-espera'));
  assert.equal(response.status,405); assert.equal(response.headers.get('allow'),'POST');
});

test('banco indisponível e configuração ausente não retornam sucesso nem detalhes internos', async () => {
  const broken = {query:async () => { throw new Error('password=SECRET select internal_table'); }};
  const response = await signup(request(),{ db:broken,env });
  assert.equal(response.status,503);
  const text = await response.text(); assert.doesNotMatch(text,/SECRET|password|internal_table|stack/);
  const absent = await signup(request(),{db,env:{}});
  assert.equal(absent.status,503); assert.equal((await absent.json()).code,'not_configured');
});

test('limite compartilhado por IP devolve 429 e Retry-After', async () => {
  for(let i=0;i<5;i++) assert.equal((await run(request({name:'Teste',email:'test'+i+'@example.com'}))).status,200);
  const response = await run(request({name:'Teste',email:'blocked@example.com'}));
  assert.equal(response.status,429); assert.ok(Number(response.headers.get('retry-after'))>0);
  assert.equal((await saved()).rows.length,5);
  const limits = await db.query('SELECT key FROM waitlist.rate_limits');
  assert.ok(limits.rows.every(row => !row.key.includes('@') && !row.key.includes('local-development')));
});

test('limite por e-mail e expiração são atômicos no banco', async () => {
  await Promise.all(Array.from({length:3}, () => consumeRate(db,'example-limit',3,60)));
  await assert.rejects(consumeRate(db,'example-limit',3,60), error => error.status===429);
  await db.query("UPDATE waitlist.rate_limits SET expires_at=now()-interval '1 second'");
  await consumeRate(db,'example-limit',3,60);
  assert.equal((await db.query('SELECT count FROM waitlist.rate_limits')).rows[0].count,1);
});

test('não confia em x-forwarded-for arbitrário fora da Vercel', () => {
  assert.equal(clientAddress(request(undefined,{'x-forwarded-for':'8.8.8.8'}),env),'local-development');
  assert.throws(() => clientAddress(request(),{VERCEL:'1'}));
  assert.equal(clientAddress(request(undefined,{'x-forwarded-for':'203.0.113.5'}),{VERCEL:'1'}),'203.0.113.5');
});

test('descadastro exige token válido; GET não modifica; repetição não reativa', async () => {
  const id = await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  const token = unsubscribeToken(id,env.UNSUBSCRIBE_SECRET);
  assert.equal(verifyUnsubscribeToken(token,env.UNSUBSCRIBE_SECRET),id);
  assert.equal(verifyUnsubscribeToken(token+'x',env.UNSUBSCRIBE_SECRET),null);
  const get = await unsubscribeRoute.fetch(new Request(env.SITE_URL+'/api/descadastro?token='+token));
  assert.equal(get.status,405); assert.equal((await saved()).rows[0].status,'active');
  const invalid = await unsubscribe(request({token:'bad'}),{db,env});
  assert.equal(invalid.status,400);
  const response = await unsubscribe(request({token}),{db,env});
  assert.equal(response.status,200); assert.equal((await saved()).rows[0].status,'unsubscribed');
  assert.equal((await jobs()).rows[0].state,'skipped');
  assert.equal((await run(request())).status,200);
  assert.equal((await saved()).rows[0].status,'unsubscribed'); assert.equal((await jobs()).rows.length,1);
});

test('descadastro one-click funciona por POST sem depender de cookies', async () => {
  const id = await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  const token = unsubscribeToken(id,env.UNSUBSCRIBE_SECRET);
  const req = new Request(env.SITE_URL+'/api/descadastro?token='+token, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'});
  assert.equal((await unsubscribe(req,{db,env})).status,200);
  assert.equal((await saved()).rows[0].status,'unsubscribed');
});

test('worker envia só confirmação, registra ID e não duplica em nova execução', async () => {
  await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  let calls=0;
  const send = async (payload,key) => {
    calls++; assert.equal(payload.to[0],'teste@example.com');
    assert.ok(payload.text.includes('Você entrou na lista de espera do Trafe King.'));
    assert.ok(payload.html.includes('#00F758')); assert.ok(payload.headers['List-Unsubscribe-Post']);
    assert.match(key,/^trafe-king\//); return 'email-provider-id';
  };
  assert.equal((await worker({send})).sent,1);
  assert.equal((await worker({send})).sent,0);
  assert.equal(calls,1); assert.equal((await jobs()).rows[0].provider_id,'email-provider-id');
});

test('falha do Resend preserva cadastro e a repetição usa payload e chave idênticos', async () => {
  await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  let first;
  await worker({send:async (payload,key) => { first={payload,key}; throw new DeliveryError('provider_unreachable'); }});
  assert.equal((await saved()).rows[0].status,'active');
  assert.equal((await jobs()).rows[0].state,'pending');
  await db.query("UPDATE waitlist.email_jobs SET available_at=now()-interval '1 second'");
  const result = await worker({ config:{...emailConfig(),from:'Changed <other@example.com>'}, send:async (payload,key) => {
    assert.deepEqual({payload,key},first); return 'recovered';
  }});
  assert.equal(result.sent,1);
});

test('resultado ambíguo com mais de 23h exige revisão, sem novo envio automático', async () => {
  await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  await db.query("UPDATE waitlist.email_jobs SET state='sending', first_attempt_at=now()-interval '24 hours', lease_until=now()-interval '1 hour'");
  const result = await worker({send:async () => { throw new Error('Não deveria enviar'); }});
  assert.equal(result.sent,0); assert.equal((await jobs()).rows[0].state,'review');
});

test('trava impede dois workers; descadastrados não recebem', async () => {
  const id = await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  await db.query("INSERT INTO waitlist.worker_locks VALUES ('email',$1,now()+interval '2 minutes')",[randomUUID()]);
  assert.equal((await worker({send:async()=>{throw new Error('must not send');}})).busy,true);
  await db.query('DELETE FROM waitlist.worker_locks'); await suppressSubscription(db,id);
  assert.equal((await worker({send:async()=>{throw new Error('must not send');}})).sent,0);
});

test('campanha tem snapshot de ativos e só é enviada por execução explícita', async () => {
  const active = await saveSubscription(db,{name:'Ativo',email:'active@example.com'});
  const inactive = await saveSubscription(db,{name:'Inativo',email:'inactive@example.com'});
  await suppressSubscription(db,inactive);
  await assert.rejects(enqueueLaunch(db,'launch-v1',getConfig(env)));
  const config = {...emailConfig(),launchEnabled:true};
  assert.equal(await enqueueLaunch(db,'launch-v1',config),1);
  assert.equal(await enqueueLaunch(db,'launch-v1',config),0);
  await worker({config,send:async payload => { assert.match(payload.subject,/inscrição/); return 'confirmation'; }});
  const launch = (await jobs()).rows.filter(row=>row.kind==='launch');
  assert.equal(launch.length,1); assert.equal(launch[0].state,'pending'); assert.equal(launch[0].subscriber_id,active);
  assert.equal((await worker({config,kind:'launch',campaign:'launch-v1',send:async payload=>{assert.match(payload.subject,/lançamento/);return 'launch';}})).sent,1);
});

test('webhook verifica assinatura e respeita reclamação mesmo antes do ID do envio ser gravado', async () => {
  await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  const secret = 'whsec_'+Buffer.alloc(32,7).toString('base64');
  const payload = JSON.stringify({type:'email.complained',data:{email_id:'future-id'}});
  const webhookEnv = {...env,RESEND_WEBHOOK_SECRET:secret};
  const makeRequest = signature => new Request(env.SITE_URL+'/api/resend-webhook', {method:'POST',headers:{
    'Content-Type':'application/json','svix-id':'msg_test','svix-timestamp':String(Math.floor(Date.now()/1000)),'svix-signature':signature
  },body:payload});
  assert.equal((await handleWebhook(makeRequest('bad'),{db,env:webhookEnv})).status,400);
  const signature = new Webhook(secret).sign('msg_test',new Date(),payload);
  assert.equal((await handleWebhook(makeRequest(signature),{db,env:webhookEnv})).status,200);
  await worker({send:async()=> 'future-id'});
  assert.equal((await saved()).rows[0].status,'complained');
  assert.equal((await handleWebhook(makeRequest(signature),{db,env:webhookEnv})).status,200);
});

test('processador rejeita chamadas sem segredo e nunca aceita campanha via HTTP', async () => {
  assert.equal((await processEmails(new Request(env.SITE_URL+'/api/processar-emails'),{db,env})).status,401);
  const request = new Request(env.SITE_URL+'/api/processar-emails?kind=launch',{headers:{Authorization:'Bearer '+env.CRON_SECRET}});
  assert.equal((await processEmails(request,{db,env})).status,503); // E-mail desativado, sem envio.
});

test('canal de privacidade exibe apenas o contato público', async () => {
  const response = privacyContact(env);
  assert.equal(response.status,200);
  const html = await response.text(); assert.ok(html.includes(env.PRIVACY_EMAIL));
  assert.ok(!html.includes(env.RATE_LIMIT_SECRET)); assert.ok(!html.includes(env.RESEND_API_KEY));
});

test('cliente Resend usa chave somente no header do servidor e trata falhas com código seguro', async t => {
  t.mock.method(globalThis,'fetch',async (url, init) => {
    assert.equal(url,'https://api.resend.com/emails');
    assert.equal(init.headers.Authorization,'Bearer '+env.RESEND_API_KEY);
    assert.equal(init.headers['Idempotency-Key'],'test-job');
    return Response.json({id:'test-provider-id'});
  });
  assert.equal(await sendWithResend({to:['test@example.com']},'test-job',emailConfig()),'test-provider-id');
  t.mock.method(globalThis,'fetch',async () => Response.json({message:'internal stack secret'},{status:401}));
  await assert.rejects(sendWithResend({},'test-job',emailConfig()),error=>error.code==='provider_rejected' && !error.message.includes('secret'));
});

test('falha no agendamento depois do commit mantém HTTP 200 e fila persistente', async () => {
  const response = await signup(request(),{db,env:{...env,EMAIL_ENABLED:'true'},schedule:()=>{throw new Error('context unavailable');}});
  assert.equal(response.status,200); assert.deepEqual(await response.json(),{ok:true});
  assert.equal((await saved()).rows.length,1); assert.equal((await jobs()).rows[0].state,'pending');
});

test('cancelamento após enfileirar lançamento impede o envio', async () => {
  const id = await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  const config = {...emailConfig(),launchEnabled:true};
  await enqueueLaunch(db,'launch-v2',config);
  await suppressSubscription(db,id);
  const result = await worker({config,kind:'launch',campaign:'launch-v2',send:async()=>{throw new Error('must not send');}});
  assert.equal(result.sent,0);
  assert.ok((await jobs()).rows.every(job=>job.state==='skipped'));
});

test('trava UNIQUE de e-mail é aplicada pelo próprio banco', async () => {
  await saveSubscription(db,{name:'Teste',email:'teste@example.com'});
  await assert.rejects(db.query('INSERT INTO waitlist.subscribers(id,name,email,consent_version) VALUES ($1,$2,$3,$4)',
    [randomUUID(),'Outro','teste@example.com',CONSENT_VERSION]),error=>error.code==='23505');
});
