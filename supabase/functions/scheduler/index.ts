// Edge Function: scheduler — la invoca pg_cron (ver supabase/cron.sql).
//   ?job=push            → envía la cola de notificaciones push
//   ?job=weekly_income   → jueves: quién no ha registrado ingresos
//   ?job=bill_reminders  → pagos por vencer / vencidos
//   ?job=monthly_summary → resumen del mes anterior
//   ?job=bank_sync       → sincroniza conexiones bancarias
// Desplegar con: supabase functions deploy scheduler --no-verify-jwt
import { adminClient, json } from '../_shared/admin.ts';
import { flushPushQueue } from '../_shared/push.ts';
import { addDays, daysBetween, localParts, money, weekStart } from '../_shared/dates.ts';
import { belvoConfigured, syncConnection } from '../_shared/belvo.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

type Notif = {
  user_id: string;
  group_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupe_key?: string;
};

async function insertNotifications(db: SupabaseClient, rows: Notif[]) {
  if (!rows.length) return 0;
  const { data, error } = await db
    .from('notifications')
    .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Registro semanal de ingresos
// ---------------------------------------------------------------------------
async function weeklyIncome(db: SupabaseClient) {
  const { data: groups } = await db.from('groups').select('id, name, timezone, income_check_weekday');
  let created = 0;

  for (const g of groups ?? []) {
    const now = localParts(g.timezone || 'America/Mexico_City');
    if (now.weekday !== g.income_check_weekday) continue;
    // 10:00 → recordatorio amable; 20:00 → aviso final y alerta al grupo
    const phase = now.hour === 10 ? 'reminder' : now.hour === 20 ? 'final' : null;
    if (!phase) continue;

    const ws = weekStart(now.date);
    const we = addDays(ws, 6);

    const [{ data: members }, { data: incomes }, { data: checkins }] = await Promise.all([
      db.from('group_members').select('user_id, requires_weekly_income, profiles:profiles!inner(full_name)')
        .eq('group_id', g.id),
      db.from('transactions').select('user_id').eq('group_id', g.id).eq('kind', 'income')
        .gte('occurred_on', ws).lte('occurred_on', we),
      db.from('income_checkins').select('user_id, status').eq('group_id', g.id).eq('week_start', ws),
    ]);

    const done = new Set([...(incomes ?? []).map((t) => t.user_id), ...(checkins ?? []).map((c) => c.user_id)]);
    // deno-lint-ignore no-explicit-any
    const all = (members ?? []) as any[];
    const missing = all.filter((m) => m.requires_weekly_income && !done.has(m.user_id));
    if (!missing.length) continue;

    const rows: Notif[] = missing.map((m) => ({
      user_id: m.user_id,
      group_id: g.id,
      type: 'income_missing',
      title: phase === 'reminder' ? '📝 Hoy toca registrar tus ingresos' : '⏰ Aún no registras tus ingresos',
      body: phase === 'reminder'
        ? `Es ${WEEKDAY_NAMES[g.income_check_weekday]}: registra lo que recibiste esta semana en "${g.name}".`
        : `El grupo "${g.name}" sigue esperando tu registro semanal. Si no tuviste ingresos, márcalo en la app.`,
      data: { screen: '/transaction/new?kind=income' },
      dedupe_key: `income-${phase}-${g.id}-${ws}`,
    }));

    if (phase === 'final') {
      const names = missing.map((m) => m.profiles?.full_name || 'Alguien').join(', ');
      for (const m of all.filter((x) => !missing.some((y) => y.user_id === x.user_id))) {
        rows.push({
          user_id: m.user_id,
          group_id: g.id,
          type: 'income_missing_group',
          title: '👀 Registro semanal pendiente',
          body: `${names} no ha(n) registrado ingresos esta semana.`,
          data: { screen: '/' },
          dedupe_key: `income-group-${g.id}-${ws}`,
        });
      }
    }
    created += await insertNotifications(db, rows);
  }
  return { created };
}

// ---------------------------------------------------------------------------
// Recordatorios de pagos
// ---------------------------------------------------------------------------
async function billReminders(db: SupabaseClient) {
  const { data: bills } = await db
    .from('bills')
    .select('id, group_id, name, amount, period_paid, next_due_date, remind_days_before, assigned_to, autopay, groups(timezone)')
    .eq('active', true);
  const { data: members } = await db.from('group_members').select('group_id, user_id');
  const membersByGroup = new Map<string, string[]>();
  for (const m of members ?? []) membersByGroup.set(m.group_id, [...(membersByGroup.get(m.group_id) ?? []), m.user_id]);

  const rows: Notif[] = [];
  // deno-lint-ignore no-explicit-any
  for (const b of (bills ?? []) as any[]) {
    const today = localParts(b.groups?.timezone || 'America/Mexico_City').date;
    const left = daysBetween(today, b.next_due_date);
    const remaining = Number(b.amount) - Number(b.period_paid);
    if (remaining <= 0) continue;

    let title = '';
    let body = '';
    if (left === b.remind_days_before && left > 0) {
      title = `📅 ${b.name} vence en ${left} día${left === 1 ? '' : 's'}`;
      body = `${money(remaining)} — fecha límite ${b.next_due_date}${b.autopay ? ' (cargo automático)' : ''}`;
    } else if (left === 1 && b.remind_days_before !== 1) {
      title = `⏳ ${b.name} vence mañana`;
      body = `Quedan ${money(remaining)} por pagar.`;
    } else if (left === 0) {
      title = `🔔 Hoy vence ${b.name}`;
      body = `Paga ${money(remaining)} hoy para evitar recargos.`;
    } else if ([-1, -3, -7].includes(left)) {
      title = `🚨 ${b.name} está vencido`;
      body = `Venció hace ${-left} día(s). Pendiente: ${money(remaining)}.`;
    } else continue;

    const targets = b.assigned_to ? [b.assigned_to] : membersByGroup.get(b.group_id) ?? [];
    for (const uid of targets) {
      rows.push({
        user_id: uid,
        group_id: b.group_id,
        type: left < 0 ? 'bill_overdue' : 'bill_due',
        title,
        body,
        data: { screen: `/bills/${b.id}`, bill_id: b.id },
        dedupe_key: `bill-${b.id}-${b.next_due_date}-${left}`,
      });
    }
  }
  return { created: await insertNotifications(db, rows) };
}

// ---------------------------------------------------------------------------
// Resumen mensual
// ---------------------------------------------------------------------------
async function monthlySummary(db: SupabaseClient) {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const monthName = new Date(first + 'T12:00:00Z').toLocaleDateString('es-MX', { month: 'long' });

  const { data: groups } = await db.from('groups').select('id, name');
  const rows: Notif[] = [];
  for (const g of groups ?? []) {
    const { data: txns } = await db.from('transactions').select('kind, amount')
      .eq('group_id', g.id).gte('occurred_on', first).lte('occurred_on', last);
    const income = (txns ?? []).filter((t) => t.kind === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = (txns ?? []).filter((t) => t.kind === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    if (!income && !expense) continue;
    const saved = income - expense;
    const rate = income > 0 ? Math.round((saved / income) * 100) : 0;
    const { data: members } = await db.from('group_members').select('user_id').eq('group_id', g.id);
    for (const m of members ?? []) {
      rows.push({
        user_id: m.user_id,
        group_id: g.id,
        type: 'monthly_summary',
        title: `📊 Resumen de ${monthName}`,
        body: `Ingresos ${money(income)} · Gastos ${money(expense)} · ${saved >= 0 ? 'Ahorro' : 'Déficit'} ${money(Math.abs(saved))} (${rate}%)`,
        data: { screen: '/metrics' },
        dedupe_key: `monthly-${g.id}-${first}`,
      });
    }
  }
  return { created: await insertNotifications(db, rows) };
}

async function bankSync(db: SupabaseClient) {
  if (!belvoConfigured()) return { skipped: true };
  const { data: conns } = await db.from('bank_connections').select('*').eq('status', 'active');
  let imported = 0;
  for (const c of conns ?? []) {
    try {
      imported += await syncConnection(db, c);
    } catch (e) {
      console.error('bank sync', c.id, e);
      await db.from('bank_connections').update({ status: 'error' }).eq('id', c.id);
    }
  }
  return { imported };
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return json({ error: 'forbidden' }, 403);
  }
  const job = new URL(req.url).searchParams.get('job');
  const db = adminClient();
  try {
    let result: unknown;
    switch (job) {
      case 'push': result = await flushPushQueue(db); break;
      case 'weekly_income': result = await weeklyIncome(db); await flushPushQueue(db); break;
      case 'bill_reminders': result = await billReminders(db); await flushPushQueue(db); break;
      case 'monthly_summary': result = await monthlySummary(db); await flushPushQueue(db); break;
      case 'bank_sync': result = await bankSync(db); break;
      default: return json({ error: 'job desconocido' }, 400);
    }
    return json({ job, result });
  } catch (e) {
    console.error(job, e);
    return json({ error: String(e) }, 500);
  }
});
