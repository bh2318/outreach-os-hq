-- Enable extensions for scheduled HTTP calls
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove old job if it exists, then schedule poll-gmail-inbox every 5 minutes
do $$
begin
  perform cron.unschedule('poll-gmail-inbox-every-5min');
exception when others then null;
end $$;

select cron.schedule(
  'poll-gmail-inbox-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://uyirdmipfazvtibcfatq.supabase.co/functions/v1/poll-gmail-inbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aXJkbWlwZmF6dnRpYmNmYXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNDEzMzEsImV4cCI6MjA5MjkxNzMzMX0.hPxBZpZiGoQGtNrZQ1UgncqO2sbAhmPnpC2EXPzT2LI'
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $$
);