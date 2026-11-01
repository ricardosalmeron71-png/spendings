-- =====================================================================
--  Aviso de cada movimiento nuevo de otros miembros del grupo
--  Ejecuta este archivo en el SQL Editor (después de la migración inicial).
--  Es seguro correrlo más de una vez.
-- =====================================================================
set search_path = finanzas, public;

-- Cada persona decide si quiere recibir estos avisos (activado por defecto)
alter table finanzas.group_members
  add column if not exists notify_activity boolean not null default true;

-- Un miembro solo puede cambiar SU propia preferencia (no su rol ni nada más)
create or replace function finanzas.set_my_notify_activity(p_group uuid, p_value boolean)
returns void language sql security definer set search_path = finanzas, public as $$
  update group_members set notify_activity = p_value
  where group_id = p_group and user_id = auth.uid();
$$;
grant execute on function finanzas.set_my_notify_activity(uuid, boolean) to authenticated, service_role;

create or replace function finanzas.notify_group_on_txn()
returns trigger language plpgsql security definer set search_path = finanzas, public as $$
declare
  actor uuid := coalesce(auth.uid(), new.user_id);
  actor_name text; who_name text; cat_name text; what text; amt text; ttl text;
begin
  -- Los movimientos importados del banco se avisan aparte (al revisar)
  if new.bank_txn_id is not null then return new; end if;

  select full_name into actor_name from profiles where id = actor;
  select full_name into who_name   from profiles where id = new.user_id;
  select name      into cat_name   from categories where id = new.category_id;
  amt := '$' || to_char(new.amount, 'FM999,999,990.00');
  what := nullif(trim(coalesce(new.description, '')), '');

  if new.kind = 'income' then
    ttl := '💰 Nuevo ingreso';
    insert into notifications (user_id, group_id, type, title, body, data)
    select m.user_id, new.group_id, 'income_added', ttl,
           coalesce(actor_name, 'Alguien') || ' registró un ingreso de ' || amt
             || case when new.user_id <> actor then ' de ' || coalesce(who_name, 'otro miembro') else '' end
             || coalesce(' — ' || what, ''),
           jsonb_build_object('transaction_id', new.id, 'screen', '/transaction/' || new.id)
    from group_members m
    where m.group_id = new.group_id and m.user_id <> actor and m.notify_activity;

    -- Marca el registro semanal de ingresos como cumplido
    insert into income_checkins (group_id, user_id, week_start, status)
    values (new.group_id, new.user_id, week_start(new.occurred_on), 'registered')
    on conflict (group_id, user_id, week_start) do update set status = 'registered';

  elsif new.kind = 'expense' then
    ttl := case when new.amount >= 2000 then '💸 Gasto importante' else '🧾 Nuevo gasto' end;
    insert into notifications (user_id, group_id, type, title, body, data)
    select m.user_id, new.group_id,
           case when new.amount >= 2000 then 'big_expense' else 'expense_added' end, ttl,
           coalesce(actor_name, 'Alguien') || ' registró un gasto de ' || amt
             || case when new.user_id <> actor then ' de ' || coalesce(who_name, 'otro miembro') else '' end
             || coalesce(' — ' || what, '') || coalesce(' (' || cat_name || ')', ''),
           jsonb_build_object('transaction_id', new.id, 'screen', '/transaction/' || new.id)
    from group_members m
    where m.group_id = new.group_id and m.user_id <> actor and m.notify_activity;
  end if;
  return new;
end $$;
