-- Execute com db:migrate (transação + trava). O site não aplica DDL nas requisições.
CREATE SCHEMA IF NOT EXISTS waitlist;
REVOKE ALL ON SCHEMA waitlist FROM PUBLIC;
CREATE TABLE IF NOT EXISTS waitlist.subscribers (
  id uuid PRIMARY KEY,
  name varchar(80) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  created_at timestamptz NOT NULL DEFAULT now(),
  consent_at timestamptz NOT NULL DEFAULT now(),
  consent_version varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
  unsubscribed_at timestamptz
);
CREATE TABLE IF NOT EXISTS waitlist.campaigns (
  id varchar(64) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS waitlist.email_jobs (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES waitlist.subscribers(id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL CHECK (kind IN ('confirmation', 'launch')),
  campaign_id varchar(64) NOT NULL DEFAULT 'confirmation-v1',
  state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'sent', 'skipped', 'review')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  lease_until timestamptz,
  payload jsonb,
  provider_id text,
  sent_at timestamptz,
  last_error_code varchar(40),
  UNIQUE (subscriber_id, kind, campaign_id)
);
CREATE INDEX IF NOT EXISTS jobs_pending_idx ON waitlist.email_jobs(kind, state, available_at);
CREATE INDEX IF NOT EXISTS subscribers_active_idx ON waitlist.subscribers(created_at) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS waitlist.rate_limits (
  key varchar(90) PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_expiry_idx ON waitlist.rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS waitlist.worker_locks (
  key text PRIMARY KEY, owner uuid NOT NULL, expires_at timestamptz NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA waitlist FROM PUBLIC;
