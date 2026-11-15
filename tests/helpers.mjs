import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
export const env = {
  SITE_URL:'https://trafe-king.example', PRIVACY_EMAIL:'privacidade@trafe-king.example',
  RATE_LIMIT_SECRET:'test-only-rate-secret-'.repeat(3),
  UNSUBSCRIBE_SECRET:'test-only-optout-secret-'.repeat(3),
  CRON_SECRET:'test-only-cron-secret-'.repeat(3),
  EMAIL_ENABLED:'false', EMAIL_FROM:'Trafe King. <avisos@trafe-king.example>',
  RESEND_API_KEY:'not-a-real-api-key', NODE_ENV:'test'
};
export async function database(directory) {
  const pg = await PGlite.create(directory);
  await pg.exec(await fs.readFile(new URL('../migrations/001_waitlist.sql', import.meta.url), 'utf8'));
  await pg.exec(await fs.readFile(new URL('../migrations/002_delivery_events.sql', import.meta.url), 'utf8'));
  // PGlite tem uma conexão. A trava serializa transações; as constraints são do PostgreSQL real.
  let next = Promise.resolve();
  const acquire = async () => {
    const previous = next; let release;
    next = new Promise(resolve => { release = resolve; });
    await previous; return release;
  };
  const query = async (sql, params) => {
    const result = await pg.query(sql, params);
    return { rows:result.rows, rowCount:result.affectedRows ?? result.rows.length };
  };
  const db = {
    query:async (sql, params) => { const release = await acquire(); try { return await query(sql, params); } finally { release(); } },
    connect:async () => { const release = await acquire(); return {query, release}; },
    close:() => pg.close(),
    reset:() => pg.exec('TRUNCATE waitlist.subscribers, waitlist.email_jobs, waitlist.campaigns, waitlist.worker_locks, waitlist.rate_limits, waitlist.delivery_events CASCADE')
  };
  return db;
}
export const request = (body = { name:'Samuel Teste', email:'teste@example.com' }, headers = {}) =>
  new Request(env.SITE_URL + '/api/lista-de-espera', { method:'POST', headers:{ 'Content-Type':'application/json', Origin:env.SITE_URL, ...headers }, body:typeof body === 'string' ? body : JSON.stringify(body) });
