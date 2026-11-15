import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDb, transaction, closeDb } from '../server/db.js';
import { getConfig, getEmailConfig, validEmail } from '../server/config.js';
import { enqueueLaunch, validateCampaign } from '../server/subscriptions.js';
import { runWorker, applyDeliveryEvent } from '../server/worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);
const option = key => args.find(arg => arg.startsWith('--' + key + '='))?.slice(key.length + 3);
const flag = key => args.includes('--' + key);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
try {
  if (!['migrate','inspect','remove','worker','launch','review'].includes(command)) throw new Error('Comando inválido.');
  const db = getDb(command === 'migrate' && process.env.DATABASE_MIGRATION_URL
    ? { ...process.env, DATABASE_URL:process.env.DATABASE_MIGRATION_URL } : process.env);
  if (command === 'migrate') {
    await transaction(db, async client => {
      await client.query("SELECT pg_advisory_xact_lock(87341206)");
      await client.query('CREATE SCHEMA IF NOT EXISTS waitlist');
      await client.query('CREATE TABLE IF NOT EXISTS waitlist.schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      for (const name of (await fs.readdir(path.join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
        const sql = await fs.readFile(path.join(root, 'migrations', name), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        const existing = await client.query('SELECT checksum FROM waitlist.schema_migrations WHERE name = $1', [name]);
        if (existing.rows.length) {
          if (existing.rows[0].checksum !== checksum) throw new Error('Migração aplicada foi alterada: ' + name);
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO waitlist.schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        console.log('Aplicada: ' + name);
      }
    });
    console.log('Banco atualizado.');
  } else if (command === 'inspect') {
    const email = option('email')?.trim().toLowerCase();
    if (!validEmail(email)) throw new Error('Informe --email=seu-email.');
    const result = await db.query(
      'SELECT s.id, s.name, s.email, s.created_at AS "createdAt", s.consent_at AS "consentAt", s.consent_version AS "consentVersion", s.status, ' +
      "(SELECT json_agg(json_build_object('id',j.id,'kind',j.kind,'state',j.state,'providerId',j.provider_id,'errorCode',j.last_error_code)) FROM waitlist.email_jobs j WHERE j.subscriber_id = s.id) AS emails " +
      'FROM waitlist.subscribers s WHERE s.email = $1', [email]);
    console.log(JSON.stringify(result.rows, null, 2));
  } else if (command === 'remove') {
    const email = option('email')?.trim().toLowerCase();
    if (!validEmail(email) || option('confirm') !== 'remove') throw new Error('Confirme a identidade e use --email=... --confirm=remove.');
    const result = await db.query('DELETE FROM waitlist.subscribers WHERE email = $1 RETURNING id', [email]);
    console.log('Registros removidos: ' + result.rowCount + '. A fila vinculada foi excluída. Verifique também dados/backups nos fornecedores.');
  } else if (command === 'launch') {
    const campaign = validateCampaign(option('campaign'));
    const count = await db.query("SELECT count(*)::integer AS active FROM waitlist.subscribers WHERE status = 'active'");
    const existing = await db.query('SELECT id FROM waitlist.campaigns WHERE id = $1', [campaign]);
    console.log(JSON.stringify({ campaign, active:count.rows[0].active, alreadyQueued:existing.rows.length > 0 }));
    if (flag('enqueue')) {
      if (option('confirm') !== campaign) throw new Error('Para criar a fila, use --confirm=' + campaign);
      console.log('Incluídos na fila: ' + await enqueueLaunch(db, campaign, getConfig()));
      console.log('Nenhum e-mail é enviado por este comando.');
    } else console.log('Prévia apenas: nenhuma alteração e nenhum envio.');
  } else if (command === 'worker') {
    if (!flag('send')) throw new Error('Para enviar e-mails reais, acrescente --send. Consulte SETUP-EMAIL.md.');
    const kind = option('kind') || 'confirmation';
    const campaign = option('campaign');
    if (kind === 'launch' && option('confirm') !== campaign) throw new Error('Confirme a campanha com --confirm=identificador.');
    console.log(JSON.stringify(await runWorker({ db, config:getEmailConfig(), kind, campaign })));
  } else if (command === 'review') {
    const id = option('job');
    if (!id) {
      const rows = await db.query("SELECT id, kind, campaign_id, attempts, first_attempt_at, last_error_code FROM waitlist.email_jobs WHERE state = 'review' ORDER BY created_at LIMIT 100");
      console.log(JSON.stringify(rows.rows, null, 2));
    } else {
      if (!uuid(id)) throw new Error('ID inválido.');
      const confirmation = option('confirm');
      if (confirmation === 'sent') {
        const providerId = option('provider-id');
        if (!providerId || providerId.length > 200) throw new Error('Informe o ID confirmado no Resend.');
        await transaction(db, async client => {
          await client.query("UPDATE waitlist.email_jobs SET state='sent', provider_id=$2, sent_at=now(), payload=NULL, last_error_code=NULL WHERE id=$1 AND state='review'", [id,providerId]);
          await applyDeliveryEvent(client, providerId);
        });
      } else if (confirmation === 'retry-unsent') {
        await db.query("UPDATE waitlist.email_jobs SET state='pending', attempts=0, first_attempt_at=NULL, available_at=now(), lease_until=NULL, last_error_code=NULL WHERE id=$1 AND state='review'", [id]);
      } else throw new Error('Verifique o resultado no Resend ANTES de usar --confirm=sent ou --confirm=retry-unsent.');
      console.log('Revisão registrada. Nenhum envio efetuado por este comando.');
    }
  }
} catch (error) {
  // Só mensagens criadas neste script são seguras. Nunca imprimir stack/driver/configuração.
  const known = ['Comando inválido.', 'Informe --email', 'Confirme a identidade', 'Para criar a fila', 'Para enviar e-mails', 'Confirme a campanha',
    'Use um identificador', 'LAUNCH_ENABLED', 'Migração aplicada', 'ID inválido.', 'Informe o ID', 'Verifique o resultado'];
  console.error(known.some(prefix => error.message?.startsWith(prefix)) ? error.message : 'Operação não concluída. Verifique a configuração, acesso ao banco e migrações.');
  process.exitCode = 1;
} finally { await closeDb(); }
