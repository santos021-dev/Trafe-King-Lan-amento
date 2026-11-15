import { Webhook } from 'svix';
import { getDb, transaction } from '../server/db.js';
import { readBody, json, methodNotAllowed, safeError } from '../server/http.js';
import { applyDeliveryEvent } from '../server/worker.js';
export async function handleWebhook(request, { env = process.env, db } = {}) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!env.RESEND_WEBHOOK_SECRET) return json({ ok: false }, 503);
  let event;
  try {
    const body = await readBody(request, 65536);
    new Webhook(env.RESEND_WEBHOOK_SECRET).verify(body, {
      'svix-id': request.headers.get('svix-id'),
      'svix-timestamp': request.headers.get('svix-timestamp'),
      'svix-signature': request.headers.get('svix-signature')
    });
    event = JSON.parse(body); // svix 2 verifica a assinatura e não retorna o JSON.
  } catch { return json({ ok: false, message: 'Solicitação inválida.' }, 400); }
  const status = { 'email.bounced': 'bounced', 'email.complained': 'complained' }[event?.type];
  if (!status) return json({ ok: true });
  const providerId = event.data?.email_id;
  if (typeof providerId !== 'string' || providerId.length > 200) return json({ ok: false }, 400);
  try {
    await transaction(db || getDb(env), async client => {
      await client.query(
        "INSERT INTO waitlist.delivery_events(provider_id, status) VALUES ($1, $2) ON CONFLICT(provider_id) DO UPDATE " +
        "SET status = CASE WHEN delivery_events.status = 'complained' THEN 'complained' ELSE EXCLUDED.status END", [providerId, status]);
      await applyDeliveryEvent(client, providerId);
    });
    return json({ ok: true });
  } catch (error) { return safeError(error); }
}
export default { fetch: handleWebhook };
