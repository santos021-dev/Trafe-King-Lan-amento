import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { ConfigurationError } from './config.js';
let pool;
export function getDb(env = process.env) {
  if (pool) return pool;
  if (!env.DATABASE_URL) throw new ConfigurationError('Database unavailable');
  const url = new URL(env.DATABASE_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const insecure = local && !env.VERCEL && env.NODE_ENV !== 'production' && env.DATABASE_ALLOW_INSECURE_LOCAL === 'true';
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new ConfigurationError('Invalid database');
  // Impedir que opções da connection string desativem a verificação do certificado.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  pool = new pg.Pool({ connectionString: url.toString(), ssl: insecure ? false : { rejectUnauthorized: true },
    max: 3, idleTimeoutMillis: 1000, connectionTimeoutMillis: 5000,
    statement_timeout: 8000, query_timeout: 10000, application_name: 'trafe-king-waitlist' });
  if (env.VERCEL === '1') attachDatabasePool(pool);
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_connection_error' })));
  return pool;
}
export async function transaction(db, callback) {
  const client = await db.connect();
  try { await client.query('BEGIN'); const result = await callback(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
export async function closeDb() { if (pool) { await pool.end(); pool = undefined; } }
