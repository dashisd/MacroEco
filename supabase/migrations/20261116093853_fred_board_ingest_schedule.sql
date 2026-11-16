-- Scheduled invoke of the fred-board-ingest Edge Function.
-- Reviewable schedule only. This file does not fetch FRED, does not write
-- series_1y or observations, and does not remove existing cron jobs.
--
-- pg_cron clocks are UTC. Asia/Shanghai is UTC+8 with no daylight-saving time,
-- so Monday–Saturday 08:00, 10:00, and 14:00 Shanghai are UTC 00:00, 02:00,
-- and 06:00. Sunday is not scheduled.
--
-- The 08:00 run asks the function to fetch and upsert. The 10:00 and 14:00
-- runs set skip_if_complete, and the function returns before any write when
-- that trade date already has all five series.
--
-- These three names are permanent. The function does not add or remove jobs.
--
-- Secrets are not in this file. Before a run can call the function, store
-- them in Supabase Vault (values stay in Vault, not in git):
--   vault.create_secret('<PROJECT_URL>', 'project_url', 'API origin for Edge Functions');
--   vault.create_secret('<SUPABASE_SECRET_KEY>', 'secret_key', 'default secret key for fred-board-ingest');
-- Set the Edge Function secret FRED_API_KEY separately (<FRED_API_KEY>).
-- Until those secrets exist, the jobs are due on the clock and make no HTTP call.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net;

select cron.schedule(
  'fred-board-ingest-shanghai-0800',
  '0 0 * * 1-6',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fred-board-ingest',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body := jsonb_build_object(
      'slot', '08:00',
      'skip_if_complete', false
    ),
    timeout_milliseconds := 60000
  ) as request_id
  where coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'project_url'), '') <> ''
    and coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'secret_key'), '') <> '';
  $$
);

select cron.schedule(
  'fred-board-ingest-shanghai-1000',
  '0 2 * * 1-6',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fred-board-ingest',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body := jsonb_build_object(
      'slot', '10:00',
      'skip_if_complete', true
    ),
    timeout_milliseconds := 60000
  ) as request_id
  where coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'project_url'), '') <> ''
    and coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'secret_key'), '') <> '';
  $$
);

select cron.schedule(
  'fred-board-ingest-shanghai-1400',
  '0 6 * * 1-6',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fred-board-ingest',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body := jsonb_build_object(
      'slot', '14:00',
      'skip_if_complete', true
    ),
    timeout_milliseconds := 60000
  ) as request_id
  where coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'project_url'), '') <> ''
    and coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'secret_key'), '') <> '';
  $$
);
