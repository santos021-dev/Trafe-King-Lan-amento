import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigurationError, validEmail } from './config.js';

export const CONSENT_VERSION = '2026-11-15.v1';
export class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message); Object.assign(this, { status, code, headers });
  }
}
export const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});
export function safeError(error) {
  if (error instanceof HttpError) return json({ ok: false, code: error.code, message: error.message }, error.status, error.headers);
  const requestId = randomUUID();
  const code = error instanceof ConfigurationError ? 'not_configured' : 'unavailable';
  // Drivers/provedores podem incluir dados pessoais e credenciais no erro bruto.
  console.error(JSON.stringify({ event: 'waitlist_unavailable', code, requestId }));
  return json({ ok: false, code, requestId, message: 'Não foi possível confirmar o cadastro agora. Tente novamente mais tarde.' }, 503);
}
export function sameOrigin(request, config) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== config.siteUrl) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'forbidden', 'Solicitação não permitida.');
  }
}
export async function readBody(request, maxBytes = 4096) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new HttpError(413, 'too_large', 'A solicitação excede o tamanho permitido.');
  }
  if (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity') {
    throw new HttpError(415, 'unsupported', 'Formato de solicitação não suportado.');
  }
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0; let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'too_large', 'A solicitação excede o tamanho permitido.');
      }
      chunks.push(value);
    }
    if (timedOut) throw new HttpError(408, 'timeout', 'A solicitação demorou demais.');
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_request', 'Solicitação inválida.');
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}
export async function readJson(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, 'unsupported', 'Envie os dados em JSON.');
  }
  let body;
  try { body = JSON.parse(await readBody(request)); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_json', 'Solicitação JSON inválida.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_request', 'Solicitação inválida.');
  return body;
}
export function validateSignup(body) {
  if (Object.keys(body).some(key => !['name', 'email', 'website', 'consentVersion'].includes(key))) {
    throw new HttpError(400, 'invalid_request', 'A solicitação contém campos inválidos.');
  }
  if (body.website !== undefined && (typeof body.website !== 'string' || body.website !== '')) {
    throw new HttpError(400, 'invalid_request', 'Não foi possível processar a solicitação.');
  }
  if (body.consentVersion !== undefined && body.consentVersion !== CONSENT_VERSION) {
    throw new HttpError(400, 'consent_required', 'Atualize a página e confira o aviso de privacidade antes de se cadastrar.');
  }
  if (typeof body.name !== 'string' || body.name.length > 80 || /[\p{Cc}\p{Cf}<>]/u.test(body.name)) {
    throw new HttpError(400, 'invalid_name', 'Informe um nome válido com até 80 caracteres.');
  }
  const name = body.name.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 80) throw new HttpError(400, 'invalid_name', 'Informe seu nome.');
  if (typeof body.email !== 'string' || body.email.length > 254 || !validEmail(body.email.trim())) {
    throw new HttpError(400, 'invalid_email', 'Informe um e-mail válido com até 254 caracteres.');
  }
  return { name, email: body.email.trim().toLowerCase() };
}
export const fingerprint = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');
export function validBearer(request, secret) {
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from('Bearer ' + secret);
  const actual = Buffer.from(request.headers.get('authorization') || '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const methodNotAllowed = allowed => json({ ok: false, message: 'Método não permitido.' }, 405, { Allow: allowed });
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
