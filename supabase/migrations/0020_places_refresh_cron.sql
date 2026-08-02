-- ============================================================================
-- RADAR — 0020_places_refresh_cron
-- Daily schedule for the places-refresh edge function (ToS compliance sweep +
-- rating backfill — LOCATION-ANALYSIS G3 plan-of-record, v0.16).
--
-- The service-role key is read from Supabase Vault at run time
-- (name: 'service_role_key'). The secret itself is inserted OUT OF BAND via
-- the Management API — never in this repo. If the vault row is missing the
-- job fails quietly until it's added; (re)create it with:
--   select vault.create_secret('<key>', 'service_role_key');
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- idempotent re-schedule
do $$
begin
  perform cron.unschedule('places-refresh-daily');
exception when others then
  null; -- not scheduled yet
end $$;

select cron.schedule(
  'places-refresh-daily',
  '17 9 * * *',  -- 09:17 UTC daily (off the hour to be a polite API citizen)
  $$
  select net.http_post(
    url := 'https://domneconesznimnzxdsx.supabase.co/functions/v1/places-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key' limit 1
      )
    ),
    body := '{}'::jsonb
  )
  $$
);
