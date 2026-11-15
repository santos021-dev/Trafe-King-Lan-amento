import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { transaction } from './db.js';
import { emailPayload, sendWithResend, DeliveryError } from './email.js';
import { validateCampaign } from './subscriptions.js';

export async function applyDeliveryEvent(client, providerId) {
  // Também cobre um webhook recebido antes da gravação do ID retornado pelo Resend.
  await client.query(
    "UPDATE waitlist.subscribers s SET status = e.status, unsubscribed_at = now() " +
    "FROM waitlist.email_jobs j, waitlist.delivery_events e WHERE j.subscriber_id = s.id " +
    "AND j.provider_id = $1 AND e.provider_id = j.provider_id AND s.status = 'active'", [providerId]);
  await client.query(
    "UPDATE waitlist.email_jobs j SET state = 'skipped', payload = NULL FROM waitlist.subscribers s " +
    "WHERE j.subscriber_id = s.id AND s.status <> 'active' AND j.state IN ('pending','review')");
}
async function claimJob(db, config, kind, campaign, subscriberId) {
  return transaction(db, async client => {
    // Uma tentativa ambígua nunca é repetida além da janela de idempotência de 24h do Resend.
    await client.query(
      "UPDATE waitlist.email_jobs SET state = 'review', last_error_code = 'idempotency_window_expired' " +
      "WHERE state IN ('pending','sending') AND first_attempt_at < now() - interval '23 hours'");
    await client.query(
      "UPDATE waitlist.email_jobs j SET state = 'skipped', payload = NULL FROM waitlist.subscribers s " +
      "WHERE j.subscriber_id = s.id AND s.status <> 'active' AND (j.state = 'pending' OR (j.state = 'sending' AND j.lease_until < now()))");
    const result = await client.query(
      "SELECT j.*, s.email FROM waitlist.email_jobs j JOIN waitlist.subscribers s ON s.id = j.subscriber_id " +
      "WHERE s.status = 'active' AND j.kind = $1 AND ($2::text IS NULL OR j.campaign_id = $2) " +
      "AND ($3::uuid IS NULL OR j.subscriber_id = $3) AND j.available_at <= now() " +
      "AND (j.state = 'pending' OR (j.state = 'sending' AND j.lease_until < now())) " +
      "ORDER BY j.created_at, j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1", [kind, campaign || null, subscriberId || null]);
    const job = result.rows[0];
    if (!job) return null;
    const payload = job.payload || emailPayload(job, config);
    await client.query(
      "UPDATE waitlist.email_jobs SET state = 'sending', attempts = attempts + 1, " +
      "first_attempt_at = COALESCE(first_attempt_at, now()), lease_until = now() + interval '2 minutes', payload = $2::jsonb WHERE id = $1",
      [job.id, JSON.stringify(payload)]);
    return { ...job, payload, attempts: job.attempts + 1 };
  });
}
export async function runWorker({ db, config, kind = 'confirmation', campaign, subscriberId, limit = 10, send = sendWithResend, pause = delay }) {
  if (!config.emailEnabled) return { disabled: true, sent: 0 };
  if (!['confirmation', 'launch'].includes(kind)) throw new Error('Invalid job kind');
  if (kind === 'launch') {
    validateCampaign(campaign);
    if (!config.launchEnabled) throw new Error('Launch is disabled');
  }
  const owner = randomUUID();
  const lock = await db.query(
    "INSERT INTO waitlist.worker_locks(key, owner, expires_at) VALUES ('email', $1, now() + interval '110 seconds') " +
    "ON CONFLICT (key) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at " +
    "WHERE worker_locks.expires_at < now() RETURNING owner", [owner]);
  if (!lock.rows.length) return { busy: true, sent: 0 };
  let sent = 0, deferred = 0;
  const deadline = Date.now() + 85000;
  try {
    await db.query('DELETE FROM waitlist.rate_limits WHERE expires_at < now()');
    await db.query("DELETE FROM waitlist.delivery_events WHERE created_at < now() - interval '30 days'");
    for (let index = 0; index < Math.min(Math.max(limit, 1), 10) && Date.now() < deadline; index++) {
      const job = await claimJob(db, config, kind, campaign, subscriberId);
      if (!job) break;
      const active = await db.query("SELECT id FROM waitlist.subscribers WHERE id = $1 AND status = 'active'", [job.subscriber_id]);
      if (!active.rows.length) {
        await db.query("UPDATE waitlist.email_jobs SET state = 'skipped', payload = NULL WHERE id = $1", [job.id]);
        continue;
      }
      try {
        const providerId = await send(job.payload, 'trafe-king/' + job.id, config);
        await transaction(db, async client => {
          await client.query("UPDATE waitlist.email_jobs SET state = 'sent', sent_at = now(), provider_id = $2, payload = NULL, last_error_code = NULL WHERE id = $1", [job.id, providerId]);
          await applyDeliveryEvent(client, providerId);
        });
        sent++;
      } catch (error) {
        const known = error instanceof DeliveryError;
        const review = (known && !error.retryable) || job.attempts >= 8;
        const code = known ? error.code : 'delivery_outcome_unknown';
        await db.query(
          "UPDATE waitlist.email_jobs SET state = $2, last_error_code = $3, available_at = now() + $4 * interval '1 second', lease_until = NULL WHERE id = $1",
          [job.id, review ? 'review' : 'pending', code, Math.min(3600, 60 * 2 ** (job.attempts - 1))]);
        console.error(JSON.stringify({ event: 'email_deferred', jobId: job.id, code }));
        deferred++;
        break; // Não insistir durante indisponibilidade ou limitação do provedor.
      }
      // A trava global e esta pausa mantêm este projeto abaixo de duas chamadas por segundo.
      await pause(650);
    }
    return { sent, deferred };
  } finally {
    await db.query("DELETE FROM waitlist.worker_locks WHERE key = 'email' AND owner = $1", [owner]);
  }
}
