import { createHmac, timingSafeEqual } from 'node:crypto';
import { escapeHtml } from './http.js';

export function unsubscribeToken(id, secret) {
  return id + '.' + createHmac('sha256', secret).update('unsubscribe:v1:' + id).digest('base64url');
}
export function verifyUnsubscribeToken(token, secret) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = token.slice(0, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return null;
  const expected = Buffer.from(unsubscribeToken(id, secret));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
export function emailPayload(job, config) {
  const unsubscribe = config.siteUrl + '/descadastro/#' + unsubscribeToken(job.subscriber_id, config.unsubscribeSecret);
  const launch = job.kind === 'launch';
  const title = launch ? 'A Trafe King. está pronta para receber você.' : 'Você está na lista.';
  const message = launch
    ? 'A comunidade Trafe King. foi lançada. Acesse a plataforma para conhecer esta nova etapa e as informações de participação.'
    : 'Você entrou na lista de espera do Trafe King. Avisaremos você quando a plataforma for lançada.';
  const link = escapeHtml(config.siteUrl);
  const optout = escapeHtml(unsubscribe);
  return {
    from: config.from, to: [job.email], reply_to: config.privacyEmail,
    subject: launch ? 'O lançamento da Trafe King.' : 'Sua inscrição na lista de espera da Trafe King.',
    text: 'Trafe King.\n\n' + title + '\n\n' + message + '\n\n' + config.siteUrl +
      '\n\nVocê recebeu esta mensagem por se inscrever na lista de espera. Descadastro: ' + unsubscribe +
      '\nPara solicitar a remoção dos dados ou falar sobre privacidade, responda a este e-mail.',
    html: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
      '<body style="margin:0;background:#0B0B0D;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF">' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0B0D"><tr><td align="center" style="padding:40px 16px">' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#16161A;border:1px solid #313136"><tr><td style="padding:36px">' +
      '<p style="margin:0 0 32px;font-size:25px;font-weight:bold;color:#FFFFFF">Trafe King<span style="color:#00F758">.</span></p>' +
      '<h1 style="font-size:26px;line-height:1.3;color:#FFFFFF">' + title + '</h1>' +
      '<p style="font-size:16px;line-height:1.7;color:#D4D4D8">' + message + '</p>' +
      '<p style="margin:28px 0"><a href="' + link + '" style="display:inline-block;background:#00F758;color:#0B0B0D;padding:14px 20px;text-decoration:none;font-weight:bold">Conhecer a Trafe King.</a></p>' +
      '<p style="font-size:12px;line-height:1.7;color:#A1A1AA">Você recebeu esta mensagem por se inscrever na lista de espera. ' +
      '<a href="' + optout + '" style="color:#FFFFFF">Cancelar os avisos</a>. Para solicitar a remoção dos dados ou falar sobre privacidade, responda a este e-mail.</p>' +
      '</td></tr></table></td></tr></table></body></html>',
    headers: { 'List-Unsubscribe': '<' + config.siteUrl + '/api/descadastro?token=' +
      unsubscribeToken(job.subscriber_id, config.unsubscribeSecret) + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'category', value: launch ? 'launch' : 'confirmation' }]
  };
}
export class DeliveryError extends Error {
  constructor(code, retryable = true) { super(code); this.code = code; this.retryable = retryable; }
}
export async function sendWithResend(payload, idempotencyKey, config) {
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)
    });
  } catch { throw new DeliveryError('provider_unreachable'); }
  if (!response.ok) {
    if (response.status === 429) throw new DeliveryError('provider_rate_limit');
    if (response.status >= 500) throw new DeliveryError('provider_unavailable');
    throw new DeliveryError('provider_rejected', false);
  }
  let data;
  try { data = await response.json(); } catch { throw new DeliveryError('provider_unknown_response'); }
  if (typeof data.id !== 'string' || data.id.length > 200) throw new DeliveryError('provider_unknown_response');
  return data.id;
}
