import { getConfig, getEmailConfig, clientAddress } from './config.js';
import { getDb } from './db.js';
import { readJson, readBody, validateSignup, sameOrigin, safeError, json, HttpError, fingerprint, validBearer, escapeHtml } from './http.js';
import { signupRateLimit, saveSubscription, consumeRate, suppressSubscription } from './subscriptions.js';
import { verifyUnsubscribeToken } from './email.js';
import { runWorker } from './worker.js';

export async function signup(request, options = {}) {
  try {
    const env = options.env || process.env;
    const config = getConfig(env);
    sameOrigin(request, config);
    const input = validateSignup(await readJson(request));
    const db = options.db || getDb(env);
    await signupRateLimit(db, config, clientAddress(request, env), input.email);
    const id = await saveSubscription(db, input);
    // A inscrição já foi confirmada pelo banco. Falha de e-mail nunca desfaz esse cadastro.
    if (id && config.emailEnabled && options.schedule) {
      try {
        options.schedule(async () => {
          try { await runWorker({ db, config: getEmailConfig(env), limit: 10 }); }
          catch { console.error(JSON.stringify({ event: 'confirmation_pending' })); }
        });
      } catch { console.error(JSON.stringify({ event: 'confirmation_pending' })); }
    }
    return json({ ok: true });
  } catch (error) { return safeError(error); }
}
export async function unsubscribe(request, options = {}) {
  try {
    const env = options.env || process.env;
    const config = getConfig(env);
    const url = new URL(request.url);
    let token;
    if (request.headers.get('content-type')?.split(';')[0] === 'application/x-www-form-urlencoded') {
      // RFC 8058: provedores usam POST; GET nunca modifica a inscrição.
      const body = await readBody(request, 512);
      if (body !== 'List-Unsubscribe=One-Click') throw new HttpError(400, 'invalid_request', 'Solicitação inválida.');
      token = url.searchParams.get('token');
    } else {
      sameOrigin(request, config);
      const body = await readJson(request);
      if (Object.keys(body).some(key => key !== 'token')) throw new HttpError(400, 'invalid_request', 'Solicitação inválida.');
      token = body.token;
    }
    const id = verifyUnsubscribeToken(token, config.unsubscribeSecret);
    if (!id) throw new HttpError(400, 'invalid_token', 'Link inválido. Use o link recebido por e-mail ou o canal de privacidade.');
    const db = options.db || getDb(env);
    await consumeRate(db, 'optout:' + fingerprint(id, config.rateSecret), 10, 900);
    await suppressSubscription(db, id);
    return json({ ok: true });
  } catch (error) { return safeError(error); }
}
export async function processEmails(request, options = {}) {
  const env = options.env || process.env;
  if (!validBearer(request, env.CRON_SECRET)) return json({ ok: false, message: 'Não autorizado.' }, 401);
  try {
    // Nenhum parâmetro HTTP pode mudar o tipo para launch.
    const config = getEmailConfig(env);
    const result = await runWorker({ db: options.db || getDb(env), config, kind: 'confirmation' });
    return json({ ok: true, ...result });
  } catch (error) { return safeError(error); }
}
export function privacyContact(env = process.env) {
  try {
    const config = getConfig(env);
    const address = escapeHtml(config.privacyEmail);
    return new Response('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Privacidade | Trafe King.</title><link rel="stylesheet" href="/assets/css/styles.css"></head><body><main class="legal-page"><section class="section"><div class="container legal-copy">' +
      '<h1>CONTATO DE PRIVACIDADE</h1><p>Para solicitar acesso, correção ou remoção dos dados da lista de espera, escreva para <a href="mailto:' + address + '">' + address + '</a>.</p>' +
      '<p>Você também pode cancelar os avisos pelo link de descadastro recebido por e-mail.</p><p><a href="/privacidade/">Voltar à política de privacidade</a></p></div></section></main></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'" } });
  } catch { return json({ ok: false, message: 'O canal de privacidade ainda está sendo configurado.' }, 503); }
}
