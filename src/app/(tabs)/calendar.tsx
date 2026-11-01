import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { TransactionRow } from '@/components/TransactionRow';
import { Button, Card, IconCircle, Screen, SectionHeader, Segmented, T } from '@/components/ui';
import { useBills, useCategories, useMembers, usePaymentMethods, useTransactions, EMPTY } from '@/hooks/queries';
import { addDays, addMonths, monthEnd, monthStart, prettyDate, relativeDue, today } from '@/lib/dates';
import { compactMoney, money } from '@/lib/format';
import { totals } from '@/lib/insights';
import { spacing, useColors } from '@/lib/theme';
import type { Bill } from '@/lib/types';

LocaleConfig.locales.es = {
  monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  monthNamesShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  dayNamesShort: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';

/** Proyecta las fechas de un pago recurrente dentro de un rango */
function occurrences(b: Bill, from: string, to: string) {
  const out: string[] = [];
  let d = b.next_due_date;
  const step = (x: string) =>
    ({
      once: x,
      weekly: addDays(x, 7),
      biweekly: addDays(x, 14),
      monthly: addMonths(x, 1),
      bimonthly: addMonths(x, 2),
      quarterly: addMonths(x, 3),
      yearly: addMonths(x, 12),
    })[b.frequency];
  for (let i = 0; i < 60 && d <= to; i++) {
    if (d >= from) out.push(d);
    if (b.frequency === 'once') break;
    d = step(d);
  }
  return out;
}

export default function CalendarScreen() {
  const c = useColors();
  const [month, setMonth] = useState(monthStart(today()));
  const [selected, setSelected] = useState(today());
  const [mode, setMode] = useState<'all' | 'bills' | 'spend'>('all');

  const from = monthStart(month);
  const to = monthEnd(month);
  const tx = useTransactions({ from, to }).data ?? EMPTY;
  const bills = (useBills().data ?? []).filter((b) => b.active);
  const cats = useCategories().data ?? [];
  const members = useMembers().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const catById = new Map(cats.map((x) => [x.id, x]));

  const billDays = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of bills) for (const d of occurrences(b, from, to)) map.set(d, [...(map.get(d) ?? []), b]);
    return map;
  }, [bills, from, to]);

  const spendByDay = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of tx) {
      const v = map.get(t.occurred_on) ?? { income: 0, expense: 0 };
      if (t.kind === 'income') v.income += Number(t.amount);
      if (t.kind === 'expense') v.expense += Number(t.amount);
      map.set(t.occurred_on, v);
    }
    return map;
  }, [tx]);

  const maxSpend = Math.max(1, ...[...spendByDay.values()].map((v) => v.expense));
  const t0 = today();
  const dayTx = tx.filter((t) => t.occurred_on === selected);
  const dayBills = billDays.get(selected) ?? [];
  const monthBillsTotal = [...billDays.values()].flat().reduce((s, b) => s + Number(b.amount), 0);
  const tot = totals(tx);

  return (
    <Screen>
      <T variant="h1" style={{ marginBottom: spacing.md }}>Calendario</T>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'all', label: 'Todo' },
          { value: 'bills', label: 'Pagos' },
          { value: 'spend', label: 'Gasto diario' },
        ]}
      />
      <Card style={{ padding: spacing.sm }}>
        <Calendar
          key={c.bg}
          current={month}
          onMonthChange={(m: { dateString: string }) => setMonth(monthStart(m.dateString))}
          onDayPress={(d: { dateString: string }) => setSelected(d.dateString)}
          firstDay={1}
          enableSwipeMonths
          theme={{
            calendarBackground: c.card,
            dayTextColor: c.text,
            monthTextColor: c.text,
            textMonthFontWeight: '700',
            arrowColor: c.primary,
            todayTextColor: c.primary,
            textDisabledColor: c.border,
            textSectionTitleColor: c.textMuted,
          }}
          dayComponent={({ date, state }: { date?: { dateString: string; day: number }; state?: string }) => {
            if (!date) return null;
            const ds = date.dateString;
            const isSel = ds === selected;
            const isToday = ds === t0;
            const db = billDays.get(ds) ?? [];
            const sp = spendByDay.get(ds);
            const overdue = db.some((b) => ds < t0 && b.next_due_date === ds);
            const heat = mode === 'spend' && sp?.expense ? Math.min(1, sp.expense / maxSpend) : 0;
            return (
              <Pressable
                onPress={() => setSelected(ds)}
                style={{
                  width: 42,
                  height: 48,
                  borderRadius: 12,
                  alignItems: 'center',
                  paddingTop: 4,
                  backgroundColor: isSel ? c.primary : heat ? `rgba(240,80,110,${0.12 + heat * 0.6})` : 'transparent',
                  borderWidth: isToday && !isSel ? 1.5 : 0,
                  borderColor: c.primary,
                }}
              >
                <T
                  style={{ fontWeight: isToday || isSel ? '800' : '500', fontSize: 15 }}
                  color={isSel ? '#fff' : state === 'disabled' ? c.border : c.text}
                >
                  {date.day}
                </T>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                  {mode !== 'spend' &&
                    db.slice(0, 3).map((b, i) => (
                      <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSel ? '#fff' : overdue ? c.expense : c.info }} />
                    ))}
                  {mode === 'all' && sp?.income ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSel ? '#fff' : c.income }} /> : null}
                </View>
                {mode !== 'bills' && sp?.expense ? (
                  <T style={{ fontSize: 9 }} color={isSel ? '#fff' : c.textMuted}>{compactMoney(sp.expense)}</T>
                ) : null}
              </Pressable>
            );
          }}
        />
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        {[
          { label: 'Gastado', value: tot.expense, color: c.expense },
          { label: 'Ingresos', value: tot.income, color: c.income },
          { label: 'Pagos del mes', value: monthBillsTotal, color: c.info },
        ].map((x) => (
          <Card key={x.label} style={{ flex: 1, padding: spacing.md }}>
            <T variant="small">{x.label}</T>
            <T variant="money" color={x.color} style={{ fontSize: 15 }}>{money(x.value, false)}</T>
          </Card>
        ))}
      </View>

      <SectionHeader title={prettyDate(selected)} action="+ Agregar" onAction={() => router.push(`/transaction/new?date=${selected}`)} />

      {dayBills.length > 0 && (
        <Card>
          <T variant="label" style={{ marginBottom: 4 }}>Pagos programados</T>
          {dayBills.map((b) => {
            const cat = b.category_id ? catById.get(b.category_id) : undefined;
            const isCurrent = b.next_due_date === selected;
            return (
              <Pressable key={b.id} onPress={() => router.push(`/bills/${b.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 }}>
                <IconCircle icon={cat?.icon ?? 'receipt'} color={cat?.color ?? c.info} size={40} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{b.name}</T>
                  <T variant="small">{isCurrent ? relativeDue(b.next_due_date) : 'Próxima ocurrencia'}{b.autopay ? ' · automático' : ''}</T>
                </View>
                <T variant="money">{money(isCurrent ? b.amount - b.period_paid : b.amount, false)}</T>
              </Pressable>
            );
          })}
        </Card>
      )}

      <Card>
        {dayTx.length === 0 ? (
          <T variant="muted" center>Sin movimientos este día.</T>
        ) : (
          dayTx.map((t) => (
            <TransactionRow
              key={t.id}
              t={t}
              category={t.category_id ? catById.get(t.category_id) : undefined}
              member={members.find((m) => m.user_id === t.user_id)}
              method={methods.find((m) => m.id === t.payment_method_id)}
            />
          ))
        )}
      </Card>
      <Button title="Administrar pagos recurrentes" variant="secondary" icon="repeat" onPress={() => router.push('/bills')} />
    </Screen>
  );
}
