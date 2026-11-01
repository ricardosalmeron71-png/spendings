-- =====================================================================
--  Tareas programadas de spendings$$ (recordatorios con la app cerrada)
--
--  Ejecuta este archivo UNA vez en el SQL Editor DESPUÉS de:
--    1) correr la migración inicial
--    2) desplegar la Edge Function `fin-scheduler`
--    3) reemplazar los dos valores marcados con <<< >>> abajo
--
--  Usa nombres con prefijo `fin` para no chocar con otras apps del proyecto.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<<<TU-PROJECT-REF>>>.supabase.co', 'fin_project_url');
select vault.create_secret('<<<EL MISMO VALOR QUE FIN_CRON_SECRET>>>', 'fin_cron_secret');

create or replace function finanzas.call_scheduler(job text)
returns bigint language sql security definer set search_path = finanzas, public as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fin_project_url') || '/functions/v1/fin-scheduler?job=' || job,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fin_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$;
revoke all on function finanzas.call_scheduler(text) from public, anon, authenticated;

-- Envía la cola de notificaciones push cada minuto
select cron.schedule('fin-push-queue',      '* * * * *',   $$ select finanzas.call_scheduler('push') $$);
-- Registro semanal de ingresos (la función decide por zona horaria del grupo: 10:00 recordatorio, 20:00 aviso al grupo)
select cron.schedule('fin-weekly-income',   '0 * * * *',   $$ select finanzas.call_scheduler('weekly_income') $$);
-- Pagos por vencer / vencidos (15:00 UTC = 9:00 CDMX)
select cron.schedule('fin-bill-reminders',  '0 15 * * *',  $$ select finanzas.call_scheduler('bill_reminders') $$);
-- Resumen mensual el día 1 (16:00 UTC = 10:00 CDMX)
select cron.schedule('fin-monthly-summary', '0 16 1 * *',  $$ select finanzas.call_scheduler('monthly_summary') $$);
-- Sincronización bancaria cada 6 horas (solo hace algo si configuras Belvo)
select cron.schedule('fin-bank-sync',       '0 */6 * * *', $$ select finanzas.call_scheduler('bank_sync') $$);

-- Para ver/quitar tareas:
--   select * from cron.job where jobname like 'fin-%';
--   select cron.unschedule('fin-push-queue');
