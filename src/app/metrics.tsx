import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { CumulativeLine, Donut, HBars, IncomeExpenseBars } from '@/components/charts';
import { Card, IconCircle, Screen, SectionHeader, Segmented, T } from '@/components/ui';
import { useBudgets, useCategories, useHistory, useMembers, usePaymentMethods, EMPTY } from '@/hooks/queries';
import { addMonths, fromISODate, monthStart, shortMonth, today, WEEKDAYS } from '@/lib/dates';
import { money, pct } from '@/lib/format';
import { byCategory, dailyCumulative, groupBy, monthlySeries, totals } from '@/lib/insights';
import { spacing, useColors } from '@/lib/theme';

export default function Metrics() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const chartW = width - spacing.lg * 4;
  const [range, setRange] = useState<'month' | 'prev' | '6m'>('month');
  const history = useHistory(6).data ?? EMPTY;
  const cats = useCategories().data ?? [];
  const members = useMembers().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const budgets = useBudgets().data ?? [];

  const cur = monthStart(today());
  const scoped = useMemo(() => {
    if (range === '6m') return history;
    const m = range === 'month' ? cur : addMonths(cur, -1);
    return history.filter((t) => t.occurred_on.slice(0, 7) === m.slice(0, 7));
  }, [history, range, cur]);

  const tot = totals(scoped);
  const prevTot = totals(history.filter((t) => t.occurred_on.slice(0, 7) === addMonths(cur, range === 'prev' ? -2 : -1).slice(0, 7)));
  const slices = byCategory(scoped, cats);
  const series = monthlySeries(history, 6).map((m) => ({ ...m, label: shortMonth(m.month) }));
  const cumulative = dailyCumulative(history, range === 'prev' ? addMonths(cur, -1) : cur);
  const totalBudget = budgets.find((b) => b.category_id === null)?.amount;
  const expenses = scoped.filter((t) => t.kind === 'expense');

  const byMember = groupBy(expenses, (t) => t.user_id, (k) => {
    const m = members.find((x) => x.user_id === k);
    return { label: m?.profiles.full_name ?? 'Miembro', color: m?.profiles.avatar_color ?? c.primary };
  });
  const incomeByMember = groupBy(scoped.filter((t) => t.kind === 'income'), (t) => t.user_id, (k) => {
    const m = members.find((x) => x.user_id === k);
    return { label: m?.profiles.full_name ?? 'Miembro', color: c.income };
  });
  const byMethod = groupBy(expenses, (t) => t.payment_method_id, (k) => {
    const m = methods.find((x) => x.id === k);
    return { label: m?.name ?? 'Sin forma de pago', color: m?.color ?? c.textMuted };
  });
  const byType = groupBy(expenses, (t) => cats.find((x) => x.id === t.category_id)?.type ?? 'Otro', (k) => ({
    label: k,
    color: cats.find((x) => x.type === k)?.color ?? c.textMuted,
  }));
  const weekday = new Array(7).fill(0);
  for (const t of expenses) weekday[fromISODate(t.occurred_on).getDay()] += Number(t.amount);
  const days = range === '6m' ? 180 : range === 'month' ? Number(today().slice(8, 10)) : 30;
  const avgDaily = tot.expense / Math.max(1, days);
  const biggest = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const delta = prevTot.expense ? (tot.expense / prevTot.expense - 1) * 100 : 0;

  return (
    <Screen edges={[]}>
      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: 'month', label: 'Este mes' },
          { value: 'prev', label: 'Mes pasado' },
          { value: '6m', label: '6 meses' },
        ]}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
        {[
          { label: 'Ingresos', value: money(tot.income, false), color: c.income, icon: 'arrow-down' },
          { label: 'Gastos', value: money(tot.expense, false), color: c.expense, icon: 'arrow-up' },
          { label: 'Tasa de ahorro', value: pct(Math.max(0, tot.savingsRate)), color: c.primary, icon: 'wallet' },
          { label: 'Promedio diario', value: money(avgDaily, false), color: c.warning, icon: 'today' },
        ].map((k) => (
          <Card key={k.label} style={{ width: (width - spacing.lg * 2 - spacing.sm) / 2, marginBottom: 0 }}>
            <IconCircle icon={k.icon} color={k.color} size={32} />
            <T variant="small" style={{ marginTop: 8 }}>{k.label}</T>
            <T variant="h3">{k.value}</T>
          </Card>
        ))}
      </View>
      {range !== '6m' && prevTot.expense > 0 && (
        <T variant="small" color={delta > 0 ? c.expense : c.income} style={{ marginBottom: spacing.sm }}>
          {delta > 0 ? '▲' : '▼'} {pct(Math.abs(delta))} de gasto vs. el mes anterior
        </T>
      )}

      <SectionHeader title="Ingresos vs gastos" />
      <Card>
        <IncomeExpenseBars data={series} width={chartW} />
        <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'center', marginTop: 8 }}>
          <T variant="small" color={c.income}>● Ingresos</T>
          <T variant="small" color={c.expense}>● Gastos</T>
        </View>
      </Card>

      {range !== '6m' && (
        <>
          <SectionHeader title="Gasto acumulado del mes" />
          <Card>
            <CumulativeLine values={cumulative} budget={totalBudget} width={chartW} todayIndex={range === 'month' ? Number(today().slice(8, 10)) - 1 : undefined} />
            {totalBudget ? <T variant="small" style={{ marginTop: 6 }}>Línea punteada: ritmo ideal para no rebasar {money(totalBudget, false)}</T> : null}
          </Card>
        </>
      )}

      <SectionHeader title="Por categoría" />
      <Card>
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          <Donut data={slices} size={200} centerValue={money(tot.expense, false)} centerLabel="total gastos" />
        </View>
        {slices.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 }}>
            <IconCircle icon={s.icon ?? 'pricetag'} color={s.color} size={32} />
            <T style={{ flex: 1 }} numberOfLines={1}>{s.label}</T>
            <T variant="small">{pct((s.value / Math.max(1, tot.expense)) * 100)}</T>
            <T variant="money" style={{ minWidth: 90, textAlign: 'right' }}>{money(s.value, false)}</T>
          </View>
        ))}
      </Card>

      <SectionHeader title="Por tipo" />
      <Card><HBars data={byType} /></Card>

      {members.length > 1 && (
        <>
          <SectionHeader title="Gasto por persona" />
          <Card><HBars data={byMember} /></Card>
          <SectionHeader title="Ingreso por persona" />
          <Card><HBars data={incomeByMember} /></Card>
        </>
      )}

      <SectionHeader title="Por forma de pago" />
      <Card><HBars data={byMethod} /></Card>

      <SectionHeader title="Por día de la semana" />
      <Card>
        <HBars data={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ label: WEEKDAYS[d], value: weekday[d], color: d === 0 || d === 6 ? c.warning : c.primary }))} />
      </Card>

      <SectionHeader title="Gastos más grandes" />
      <Card>
        {biggest.map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <T style={{ flex: 1 }} numberOfLines={1}>{t.description || cats.find((x) => x.id === t.category_id)?.name}</T>
            <T variant="money">{money(t.amount, false)}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
