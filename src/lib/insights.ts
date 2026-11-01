import { addMonths, daysBetween, daysInMonth, fromISODate, monthStart, today } from './dates';
import { money } from './format';
import type { Bill, Budget, Category, Transaction } from './types';

export interface Totals {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  count: number;
}

export function totals(txns: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.kind === 'income') income += Number(t.amount);
    else if (t.kind === 'expense') expense += Number(t.amount);
  }
  const net = income - expense;
  return { income, expense, net, savingsRate: income > 0 ? (net / income) * 100 : 0, count: txns.length };
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  icon?: string;
}

export function groupBy(
  txns: Transaction[],
  keyFn: (t: Transaction) => string | null,
  meta: (key: string) => { label: string; color: string; icon?: string },
): Slice[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    const k = keyFn(t) ?? '__none__';
    map.set(k, (map.get(k) ?? 0) + Number(t.amount));
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value, ...meta(key) }))
    .sort((a, b) => b.value - a.value);
}

export function byCategory(txns: Transaction[], cats: Category[]) {
  const cmap = new Map(cats.map((c) => [c.id, c]));
  return groupBy(
    txns.filter((t) => t.kind === 'expense'),
    (t) => t.category_id,
    (k) => {
      const c = cmap.get(k);
      return c ? { label: c.name, color: c.color, icon: c.icon } : { label: 'Sin categoría', color: '#8E8E93', icon: 'help' };
    },
  );
}

/** Serie mensual de ingresos/gastos para los últimos n meses (incluye el actual). */
export function monthlySeries(txns: Transaction[], n = 6, ref = today()) {
  const months: { month: string; income: number; expense: number }[] = [];
  for (let i = n - 1; i >= 0; i--) months.push({ month: addMonths(monthStart(ref), -i), income: 0, expense: 0 });
  const idx = new Map(months.map((m, i) => [m.month.slice(0, 7), i]));
  for (const t of txns) {
    const i = idx.get(t.occurred_on.slice(0, 7));
    if (i === undefined) continue;
    if (t.kind === 'income') months[i].income += Number(t.amount);
    if (t.kind === 'expense') months[i].expense += Number(t.amount);
  }
  return months;
}

/** Gasto diario acumulado del mes vs. ritmo ideal según presupuesto */
export function dailyCumulative(txns: Transaction[], month: string) {
  const days = daysInMonth(month);
  const arr = new Array(days).fill(0);
  for (const t of txns) {
    if (t.kind !== 'expense' || t.occurred_on.slice(0, 7) !== month.slice(0, 7)) continue;
    arr[Number(t.occurred_on.slice(8, 10)) - 1] += Number(t.amount);
  }
  let acc = 0;
  return arr.map((v) => (acc += v));
}

export function projectMonthEnd(txns: Transaction[], month = today()) {
  const t = today();
  const isCurrent = month.slice(0, 7) === t.slice(0, 7);
  const spent = totals(txns.filter((x) => x.occurred_on.slice(0, 7) === month.slice(0, 7))).expense;
  if (!isCurrent) return spent;
  const day = Number(t.slice(8, 10));
  return day > 0 ? (spent / day) * daysInMonth(month) : spent;
}

/** Sugiere categoría a partir de la descripción, aprendiendo del historial del grupo. */
export function suggestCategory(description: string, history: Transaction[], kind: Transaction['kind']) {
  const q = description.toLowerCase().trim();
  if (q.length < 3) return null;
  const counts = new Map<string, number>();
  for (const t of history) {
    if (t.kind !== kind || !t.category_id) continue;
    const d = t.description.toLowerCase();
    if (d === q || d.startsWith(q) || q.startsWith(d)) {
      counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + (d === q ? 3 : 1));
    }
  }
  let best: string | null = null;
  let max = 0;
  counts.forEach((v, k) => {
    if (v > max) {
      max = v;
      best = k;
    }
  });
  return best;
}

/** Presupuesto sugerido = promedio de los últimos 3 meses completos, redondeado a $50 hacia arriba. */
export function suggestedBudget(txns: Transaction[], categoryId: string | null) {
  const ref = monthStart(today());
  const months = [1, 2, 3].map((i) => addMonths(ref, -i).slice(0, 7));
  const sums = months.map((m) =>
    txns
      .filter((t) => t.kind === 'expense' && t.occurred_on.slice(0, 7) === m && (categoryId === null || t.category_id === categoryId))
      .reduce((s, t) => s + Number(t.amount), 0),
  );
  const nonZero = sums.filter((s) => s > 0);
  if (!nonZero.length) return 0;
  const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  return Math.ceil(avg / 50) * 50;
}

export interface Insight {
  id: string;
  icon: string;
  color: string;
  title: string;
  body: string;
  priority: number; // mayor = más importante
  action?: { label: string; href: string };
}

/**
 * Motor de consejos local (instantáneo, sin IA). El asistente con IA complementa esto.
 * `history` debe incluir al menos los últimos 4 meses.
 */
export function buildInsights(params: {
  history: Transaction[];
  categories: Category[];
  budgets: Budget[];
  bills: Bill[];
  month?: string;
}): Insight[] {
  const { history, categories, budgets, bills } = params;
  const month = params.month ?? today();
  const out: Insight[] = [];
  const cmap = new Map(categories.map((c) => [c.id, c]));
  const cur = history.filter((t) => t.occurred_on.slice(0, 7) === month.slice(0, 7));
  const curTotals = totals(cur);
  const isCurrent = month.slice(0, 7) === today().slice(0, 7);

  // 1) Proyección vs presupuesto total o mes anterior
  const projected = projectMonthEnd(history, month);
  const totalBudget = budgets.find((b) => b.category_id === null)?.amount;
  const prevMonth = addMonths(monthStart(month), -1);
  const prevTotals = totals(history.filter((t) => t.occurred_on.slice(0, 7) === prevMonth.slice(0, 7)));
  if (isCurrent && totalBudget && projected > totalBudget * 1.02) {
    out.push({
      id: 'proj-budget',
      icon: 'speedometer',
      color: '#F0506E',
      title: 'Vas por encima del presupuesto',
      body: `A este ritmo cerrarás el mes en ${money(projected, false)}, ${money(projected - totalBudget, false)} arriba de tu presupuesto de ${money(totalBudget, false)}.`,
      priority: 95,
      action: { label: 'Ver presupuestos', href: '/budgets' },
    });
  } else if (isCurrent && prevTotals.expense > 0 && projected > prevTotals.expense * 1.15 && Number(today().slice(8, 10)) >= 7) {
    out.push({
      id: 'proj-prev',
      icon: 'trending-up',
      color: '#FFA928',
      title: 'Gasto acelerado',
      body: `Proyección del mes: ${money(projected, false)} (${Math.round((projected / prevTotals.expense - 1) * 100)}% más que el mes pasado).`,
      priority: 80,
    });
  }

  // 2) Categorías que se dispararon vs promedio de 3 meses
  const prev3 = [1, 2, 3].map((i) => addMonths(monthStart(month), -i).slice(0, 7));
  const avgByCat = new Map<string, number>();
  for (const t of history) {
    if (t.kind !== 'expense' || !t.category_id || !prev3.includes(t.occurred_on.slice(0, 7))) continue;
    avgByCat.set(t.category_id, (avgByCat.get(t.category_id) ?? 0) + Number(t.amount) / 3);
  }
  const curByCat = byCategory(cur, categories);
  for (const s of curByCat.slice(0, 8)) {
    const avg = avgByCat.get(s.key) ?? 0;
    if (avg > 300 && s.value > avg * 1.3) {
      out.push({
        id: `cat-up-${s.key}`,
        icon: 'alert-circle',
        color: '#FFA928',
        title: `${s.label} subió ${Math.round((s.value / avg - 1) * 100)}%`,
        body: `Llevas ${money(s.value, false)} este mes vs. ${money(avg, false)} de promedio.`,
        priority: 70,
      });
      if (out.filter((i) => i.id.startsWith('cat-up')).length >= 2) break;
    }
  }

  // 3) Presupuestos por categoría en riesgo
  for (const b of budgets.filter((x) => x.category_id)) {
    const spent = cur.filter((t) => t.kind === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
    const c = cmap.get(b.category_id!);
    if (b.amount > 0 && spent >= b.amount) {
      out.push({
        id: `bud-${b.id}`,
        icon: 'warning',
        color: '#F0506E',
        title: `Presupuesto de ${c?.name ?? 'categoría'} agotado`,
        body: `Gastado ${money(spent, false)} de ${money(b.amount, false)}.`,
        priority: 85,
        action: { label: 'Ajustar', href: '/budgets' },
      });
    }
  }

  // 4) Tasa de ahorro
  if (curTotals.income > 0) {
    if (curTotals.savingsRate < 10) {
      out.push({
        id: 'save-low',
        icon: 'wallet',
        color: '#2E90FA',
        title: 'Tu tasa de ahorro es baja',
        body: `Este mes ahorras ${Math.max(0, Math.round(curTotals.savingsRate))}% de tus ingresos. Meta sugerida: 20%. Automatiza un apartado el día de pago.`,
        priority: 60,
        action: { label: 'Crear meta', href: '/goals' },
      });
    } else if (curTotals.savingsRate >= 20) {
      out.push({
        id: 'save-good',
        icon: 'trophy',
        color: '#1DB173',
        title: '¡Excelente ritmo de ahorro!',
        body: `Llevas ${Math.round(curTotals.savingsRate)}% de ahorro. Considera mover el excedente a tu fondo de emergencia o una inversión de bajo riesgo.`,
        priority: 30,
      });
    }
  }

  // 5) Gastos hormiga
  const small = cur.filter((t) => t.kind === 'expense' && Number(t.amount) <= 150);
  const smallSum = small.reduce((s, t) => s + Number(t.amount), 0);
  if (small.length >= 8 && smallSum >= 600) {
    out.push({
      id: 'ants',
      icon: 'bug',
      color: '#E056FD',
      title: 'Gastos hormiga detectados',
      body: `${small.length} compras pequeñas suman ${money(smallSum, false)} este mes. Al año serían ~${money(smallSum * 12, false)}.`,
      priority: 55,
    });
  }

  // 6) Suscripciones / entretenimiento
  const subs = cur.filter((t) => t.kind === 'expense' && cmap.get(t.category_id ?? '')?.type === 'Entretenimiento');
  const subsSum = subs.reduce((s, t) => s + Number(t.amount), 0);
  if (subsSum >= 400) {
    out.push({
      id: 'subs',
      icon: 'tv',
      color: '#6C5CE7',
      title: 'Revisa tus suscripciones',
      body: `Pagas ${money(subsSum, false)} al mes en entretenimiento. ¿Usas todas? Rotar servicios puede ahorrarte ${money(subsSum * 0.4, false)}/mes.`,
      priority: 40,
    });
  }

  // 7) Pagos próximos
  const t0 = today();
  const soon = bills.filter((b) => b.active && daysBetween(t0, b.next_due_date) <= 7 && b.amount - b.period_paid > 0);
  const overdue = soon.filter((b) => b.next_due_date < t0);
  if (overdue.length) {
    out.push({
      id: 'overdue',
      icon: 'alarm',
      color: '#F0506E',
      title: `${overdue.length} pago(s) vencido(s)`,
      body: overdue.map((b) => `${b.name} (${money(b.amount - b.period_paid, false)})`).join(', '),
      priority: 100,
      action: { label: 'Pagar', href: '/bills' },
    });
  } else if (soon.length) {
    const sum = soon.reduce((s, b) => s + b.amount - b.period_paid, 0);
    out.push({
      id: 'soon',
      icon: 'calendar',
      color: '#2E90FA',
      title: `${soon.length} pago(s) esta semana`,
      body: `Necesitas ${money(sum, false)} para cubrir ${soon.map((b) => b.name).slice(0, 3).join(', ')}${soon.length > 3 ? '…' : ''}.`,
      priority: 75,
      action: { label: 'Ver calendario', href: '/calendar' },
    });
  }

  // 8) Fin de semana
  const weekend = cur.filter((t) => t.kind === 'expense' && [0, 6].includes(fromISODate(t.occurred_on).getDay()));
  const weekendSum = weekend.reduce((s, t) => s + Number(t.amount), 0);
  if (curTotals.expense > 3000 && weekendSum / curTotals.expense > 0.45) {
    out.push({
      id: 'weekend',
      icon: 'sunny',
      color: '#FFA928',
      title: 'Los fines de semana pesan',
      body: `${Math.round((weekendSum / curTotals.expense) * 100)}% del gasto ocurre en sábado y domingo. Planear salidas con tope fijo ayuda mucho.`,
      priority: 35,
    });
  }

  // 9) Movimientos por revisar
  const review = history.filter((t) => t.needs_review).length;
  if (review) {
    out.push({
      id: 'review',
      icon: 'checkmark-done',
      color: '#00C2A8',
      title: `${review} movimiento(s) del banco por revisar`,
      body: 'Confirma su categoría para que tus métricas sean exactas.',
      priority: 65,
      action: { label: 'Revisar', href: '/transactions?review=1' },
    });
  }

  // 10) Sin presupuesto definido
  if (!budgets.length && history.length > 15) {
    out.push({
      id: 'no-budget',
      icon: 'pie-chart',
      color: '#6C5CE7',
      title: 'Aún no tienes presupuestos',
      body: 'Con tu historial podemos sugerirte montos por categoría en un toque.',
      priority: 50,
      action: { label: 'Crear', href: '/budgets' },
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
