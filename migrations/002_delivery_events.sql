CREATE TABLE IF NOT EXISTS waitlist.delivery_events (
  provider_id text PRIMARY KEY,
  status varchar(16) NOT NULL CHECK (status IN ('bounced','complained')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON waitlist.delivery_events FROM PUBLIC;
