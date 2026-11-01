-- =====================================================================
--  Tareas programadas (recordatorios y notificaciones con la app cerrada)
--
--  Ejecuta este archivo UNA vez en el SQL Editor DESPUÉS de:
--    1) correr la migración inicial
--    2) desplegar la Edge Function `scheduler`
--    3) reemplazar los dos valores marcados con <<< >>> abajo
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda la URL del proyecto y el secreto del cron en Vault (cifrados)
select vault.create_secret('https://<<<TU-PROJECT-REF>>>.supabase.co', 'project_url');
select vault.create_secret('<<<EL MISMO VALOR QUE CRON_SECRET EN LAS EDGE FUNCTIONS>>>', 'cron_secret');

create or replace function public.call_scheduler(job text)
returns bigint language sql security definer set search_path = public as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scheduler?job=' || job,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$;
revoke all on function public.call_scheduler(text) from public, anon, authenticated;

-- Envía la cola de notificaciones push cada minuto
select cron.schedule('push-queue',      '* * * * *',  $$ select public.call_scheduler('push') $$);
-- Revisión de registro semanal de ingresos (la función decide por zona horaria del grupo: jueves 10:00 recordatorio, 20:00 aviso al grupo)
select cron.schedule('weekly-income',   '0 * * * *',  $$ select public.call_scheduler('weekly_income') $$);
-- Recordatorios de pagos próximos / vencidos (15:00 UTC = 9:00 CDMX)
select cron.schedule('bill-reminders',  '0 15 * * *', $$ select public.call_scheduler('bill_reminders') $$);
-- Resumen mensual el día 1 (16:00 UTC = 10:00 CDMX)
select cron.schedule('monthly-summary', '0 16 1 * *', $$ select public.call_scheduler('monthly_summary') $$);
-- Sincronización bancaria cada 6 horas (si usas Belvo)
select cron.schedule('bank-sync',       '0 */6 * * *', $$ select public.call_scheduler('bank_sync') $$);

-- Para ver/quitar tareas:
--   select * from cron.job;
--   select cron.unschedule('push-queue');
