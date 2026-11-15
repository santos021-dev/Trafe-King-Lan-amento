import { randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { CONSENT_VERSION, HttpError, fingerprint } from './http.js';

export async function consumeRate(db, key, limit, seconds) {
  const result = await db.query(
    'INSERT INTO waitlist.rate_limits(key, count, expires_at) VALUES ($1, 1, now() + $2 * interval \'1 second\') ' +
    'ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE LEAST(rate_limits.count + 1, $3 + 1) END, ' +
    'expires_at = CASE WHEN rate_limits.expires_at <= now() THEN now() + $2 * interval \'1 second\' ELSE rate_limits.expires_at END ' +
    'RETURNING count, expires_at', [key, seconds, limit]);
  if (result.rows[0].count > limit) {
    const retry = Math.max(1, Math.ceil((new Date(result.rows[0].expires_at).getTime() - Date.now()) / 1000));
    throw new HttpError(429, 'rate_limited', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', { 'Retry-After': String(retry) });
  }
}
export async function signupRateLimit(db, config, address, email) {
  await consumeRate(db, 'ip:' + fingerprint(address, config.rateSecret), 5, 900);
  await consumeRate(db, 'email:' + fingerprint(email, config.rateSecret), 3, 3600);
  await consumeRate(db, 'signup:global', 500, 3600);
}
export async function saveSubscription(db, { name, email }) {
  return transaction(db, async client => {
    const id = randomUUID();
    const result = await client.query(
      'INSERT INTO waitlist.subscribers (id, name, email, consent_version) VALUES ($1, $2, $3, $4) ' +
      'ON CONFLICT (email) DO NOTHING RETURNING id', [id, name, email, CONSENT_VERSION]);
    if (!result.rows.length) return null;
    await client.query(
      'INSERT INTO waitlist.email_jobs(id, subscriber_id, kind) VALUES ($1, $2, $3)',
      [randomUUID(), id, 'confirmation']);
    return id;
  });
}
export async function suppressSubscription(db, id, status = 'unsubscribed') {
  return transaction(db, async client => {
    await client.query("UPDATE waitlist.subscribers SET status = $2, unsubscribed_at = now() WHERE id = $1 AND status = 'active'", [id, status]);
    await client.query("UPDATE waitlist.email_jobs SET state = 'skipped', payload = NULL WHERE subscriber_id = $1 AND state IN ('pending','review')", [id]);
  });
}
export function validateCampaign(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(id)) throw new Error('Use um identificador de campanha com 3 a 64 letras minúsculas, números, _ ou -.');
  return id;
}
export async function enqueueLaunch(db, campaign, config) {
  validateCampaign(campaign);
  if (!config.launchEnabled) throw new Error('LAUNCH_ENABLED precisa estar true.');
  return transaction(db, async client => {
    const created = await client.query('INSERT INTO waitlist.campaigns(id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [campaign]);
    if (!created.rows.length) return 0; // Uma campanha é um snapshot, não muda a cada execução.
    const result = await client.query(
      "INSERT INTO waitlist.email_jobs(id, subscriber_id, kind, campaign_id) " +
      "SELECT gen_random_uuid(), id, 'launch', $1 FROM waitlist.subscribers WHERE status = 'active' RETURNING id", [campaign]);
    return result.rowCount;
  });
}
