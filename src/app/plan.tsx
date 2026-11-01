import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Chip, Input, Loading, ProgressBar, Screen, SectionHeader, T } from '@/components/ui';
import { useBills, useCategories, useHistory, usePlan, useSavePlan } from '@/hooks/queries';
import { addMonths, monthLabel, monthStart, today } from '@/lib/dates';
import { money, parseAmount, pct } from '@/lib/format';
import { spacing, useColors } from '@/lib/theme';
import type { MonthlyPlan, Transaction } from '@/lib/types';

const TEMPLATES = [
  { label: '50/30/20', needs: 50, wants: 30, savings: 20 },
  { label: '60/20/20', needs: 60, wants: 20, savings: 20 },
  { label: '70/20/10', needs: 70, wants: 20, savings: 10 },
  { label: '40/30/30', needs: 40, wants: 30, savings: 30 },
];
const MONTHLY_FACTOR: Record<string, number> = { once: 0, weekly: 4.33, biweekly: 2.17, monthly: 1, bimonthly: 0.5, quarterly: 1 / 3, yearly: 1 / 12 };

export default function Plan() {
  const [month, setMonth] = useState(monthStart(today()));
  const plan = usePlan(month);
  const historyQ = useHistory(6);
  if (plan.isLoading || historyQ.isLoading) return <Loading />;
  return (
    <PlanForm
      key={`${month}-${plan.data?.id ?? 'new'}`}
      month={month}
      setMonth={setMonth}
      plan={plan.data ?? null}
      history={historyQ.data ?? []}
    />
  );
}

function PlanForm({
  month,
  setMonth,
  plan,
  history,
}: {
  month: string;
  setMonth: (m: string) => void;
  plan: MonthlyPlan | null;
  history: Transaction[];
}) {
  const c = useColors();
  const savePlan = useSavePlan();
  const cats = useCategories().data ?? [];
  const bills = (useBills().data ?? []).filter((b) => b.active);

  const avgIncome = useMemo(() => {
    const months = [1, 2, 3].map((i) => addMonths(monthStart(today()), -i).slice(0, 7));
    const sums = months.map((m) => history.filter((t) => t.kind === 'income' && t.occurred_on.slice(0, 7) === m).reduce((s, t) => s + Number(t.amount), 0));
    const nz = sums.filter(Boolean);
    return nz.length ? Math.round(nz.reduce((a, b) => a + b, 0) / nz.length) : 0;
  }, [history]);

  const [income, setIncome] = useState(plan ? String(plan.expected_income) : avgIncome ? String(avgIncome) : '');
  const [split, setSplit] = useState(
    plan ? { needs: plan.needs_pct, wants: plan.wants_pct, savings: plan.savings_pct } : { needs: 50, wants: 30, savings: 20 },
  );
  const [notes, setNotes] = useState(plan?.notes ?? '');

  const inc = parseAmount(income);
  const essential = new Set(cats.filter((x) => x.is_essential).map((x) => x.id));
  const monthTx = history.filter((t) => t.occurred_on.slice(0, 7) === month.slice(0, 7));
  const actualIncome = monthTx.filter((t) => t.kind === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const actualNeeds = monthTx.filter((t) => t.kind === 'expense' && t.category_id && essential.has(t.category_id)).reduce((s, t) => s + Number(t.amount), 0);
  const actualWants = monthTx.filter((t) => t.kind === 'expense' && !(t.category_id && essential.has(t.category_id))).reduce((s, t) => s + Number(t.amount), 0);
  const actualSavings = Math.max(0, actualIncome - actualNeeds - actualWants);
  const fixed = bills.reduce((s, b) => s + Number(b.amount) * MONTHLY_FACTOR[b.frequency], 0);

  const buckets = [
    { key: 'needs', label: 'Necesidades', hint: 'Casa, servicios, súper, salud, transporte', pct: split.needs, actual: actualNeeds, color: c.info, icon: 'home' as const },
    { key: 'wants', label: 'Deseos', hint: 'Salidas, streaming, ropa, antojos', pct: split.wants, actual: actualWants, color: '#E056FD', icon: 'happy' as const },
    { key: 'savings', label: 'Ahorro / deudas', hint: 'Fondo de emergencia, metas, pago extra a tarjetas', pct: split.savings, actual: actualSavings, color: c.income, icon: 'wallet' as const },
  ];

  async function onSave() {
    try {
      await savePlan.mutateAsync({
        month,
        expected_income: inc,
        savings_target: Math.round((inc * split.savings) / 100),
        needs_pct: split.needs,
        wants_pct: split.wants,
        savings_pct: split.savings,
        notes: notes.trim() || null,
      });
      Alert.alert('Plan guardado ✅');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, -1))}><Ionicons name="chevron-back" size={22} color={c.text} /></Pressable>
        <T variant="h2">{monthLabel(month)}</T>
        <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, 1))}><Ionicons name="chevron-forward" size={22} color={c.text} /></Pressable>
      </View>

      <Card>
        <Input label="Ingreso esperado del mes" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="0" />
        {avgIncome > 0 && <T variant="small" style={{ marginTop: -6 }}>Promedio de los últimos 3 meses: {money(avgIncome, false)}</T>}
        <T variant="small" style={{ marginTop: 6 }}>Recibido a la fecha: {money(actualIncome, false)} ({inc ? pct((actualIncome / inc) * 100) : '—'})</T>
      </Card>

      <T variant="label" style={{ marginBottom: 6 }}>Distribución</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
        {TEMPLATES.map((t) => (
          <Chip key={t.label} label={t.label} selected={split.needs === t.needs && split.wants === t.wants} onPress={() => setSplit({ needs: t.needs, wants: t.wants, savings: t.savings })} />
        ))}
      </View>

      {buckets.map((b) => {
        const planned = (inc * b.pct) / 100;
        const ratio = planned ? b.actual / planned : 0;
        return (
          <Card key={b.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={b.icon} size={20} color={b.color} />
              <T variant="h3" style={{ flex: 1 }}>{b.label} · {b.pct}%</T>
              <T variant="money">{money(planned, false)}</T>
            </View>
            <T variant="small" style={{ marginVertical: 6 }}>{b.hint}</T>
            <ProgressBar value={ratio} color={b.key === 'savings' ? c.income : ratio > 1 ? c.expense : b.color} />
            <T variant="small" style={{ marginTop: 4 }}>
              {b.key === 'savings' ? 'Ahorro real estimado' : 'Gastado'}: {money(b.actual, false)}
            </T>
          </Card>
        );
      })}

      <SectionHeader title="Compromisos fijos" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T>Pagos recurrentes (mensualizados)</T>
          <T variant="money">{money(fixed, false)}</T>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <T>Ahorro planeado</T>
          <T variant="money">{money((inc * split.savings) / 100, false)}</T>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <T style={{ fontWeight: '700' }}>Libre para el mes</T>
          <T variant="money" color={inc - fixed - (inc * split.savings) / 100 < 0 ? c.expense : c.income}>
            {money(inc - fixed - (inc * split.savings) / 100, false)}
          </T>
        </View>
        {inc > 0 && fixed / inc > 0.5 && (
          <T variant="small" color={c.warning} style={{ marginTop: 8 }}>
            ⚠️ Tus pagos fijos son {pct((fixed / inc) * 100)} del ingreso. Lo sano es menos de 50%.
          </T>
        )}
      </Card>
      <T variant="small" style={{ marginBottom: spacing.md }}>
        Tip: marca en Categorías cuáles son «esenciales» para que la división necesidades/deseos sea exacta.
      </T>

      <Input label="Notas del plan" value={notes} onChangeText={setNotes} placeholder="Ej. este mes pagamos seguro del carro" multiline />
      <Button title="Guardar plan" icon="save" onPress={onSave} loading={savePlan.isPending} />
    </Screen>
  );
}
