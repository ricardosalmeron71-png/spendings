import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Chip, IconCircle, Input, ProgressBar, Screen, SectionHeader, Sheet, T } from '@/components/ui';
import { useBudgets, useCategories, useDeleteBudget, useHistory, useSaveBudget, EMPTY } from '@/hooks/queries';
import { daysInMonth, today } from '@/lib/dates';
import { money, parseAmount, pct } from '@/lib/format';
import { suggestedBudget } from '@/lib/insights';
import { spacing, useColors } from '@/lib/theme';
import type { Budget } from '@/lib/types';

export default function Budgets() {
  const c = useColors();
  const budgets = useBudgets().data ?? [];
  const cats = (useCategories().data ?? []).filter((x) => x.kind === 'expense' && !x.archived);
  const history = useHistory(4).data ?? EMPTY;
  const saveBudget = useSaveBudget();
  const delBudget = useDeleteBudget();
  const [editing, setEditing] = useState<{ budget?: Budget; categoryId: string | null } | null>(null);
  const [amount, setAmount] = useState('');
  const [alertPct, setAlertPct] = useState(80);
  const [bulkBusy, setBulkBusy] = useState(false);

  const month = today().slice(0, 7);
  const spentBy = useMemo(() => {
    const m = new Map<string | null, number>();
    let total = 0;
    for (const t of history) {
      if (t.kind !== 'expense' || t.occurred_on.slice(0, 7) !== month) continue;
      total += Number(t.amount);
      if (t.category_id) m.set(t.category_id, (m.get(t.category_id) ?? 0) + Number(t.amount));
    }
    m.set(null, total);
    return m;
  }, [history, month]);

  const totalBudget = budgets.find((b) => b.category_id === null);
  const catBudgets = budgets.filter((b) => b.category_id);
  const dayFrac = Number(today().slice(8, 10)) / daysInMonth(today());
  const unbudgeted = cats.filter((x) => !catBudgets.some((b) => b.category_id === x.id));

  function open(categoryId: string | null, budget?: Budget) {
    setEditing({ budget, categoryId });
    const sug = suggestedBudget(history, categoryId);
    setAmount(budget ? String(budget.amount) : sug ? String(sug) : '');
    setAlertPct(budget?.alert_percent ?? 80);
  }

  async function onSave() {
    if (!editing) return;
    const value = parseAmount(amount);
    if (value <= 0) return Alert.alert('Monto inválido');
    await saveBudget.mutateAsync({ id: editing.budget?.id, category_id: editing.categoryId, amount: value, alert_percent: alertPct });
    setEditing(null);
  }

  async function suggestAll() {
    const candidates = unbudgeted
      .map((x) => ({ cat: x, amount: suggestedBudget(history, x.id) }))
      .filter((x) => x.amount > 0);
    if (!candidates.length) return Alert.alert('Sin historial suficiente', 'Registra gastos durante un mes para recibir sugerencias.');
    Alert.alert(
      'Presupuestos sugeridos',
      candidates.map((x) => `${x.cat.name}: ${money(x.amount, false)}`).join('\n'),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Crear todos',
          onPress: async () => {
            setBulkBusy(true);
            try {
              for (const x of candidates) await saveBudget.mutateAsync({ category_id: x.cat.id, amount: x.amount, alert_percent: 80 });
              if (!totalBudget) {
                const t = suggestedBudget(history, null);
                if (t) await saveBudget.mutateAsync({ category_id: null, amount: t, alert_percent: 85 });
              }
            } finally {
              setBulkBusy(false);
            }
          },
        },
      ],
    );
  }

  const row = (b: Budget) => {
    const cat = cats.find((x) => x.id === b.category_id);
    const spent = spentBy.get(b.category_id) ?? 0;
    const ratio = b.amount ? spent / b.amount : 0;
    const ahead = ratio > dayFrac + 0.1 && ratio < 1;
    return (
      <Pressable key={b.id} onPress={() => open(b.category_id, b)} style={{ paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 8 }}>
          <IconCircle icon={cat?.icon ?? 'pie-chart'} color={cat?.color ?? c.primary} size={36} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{cat?.name ?? 'Total'}</T>
            <T variant="small" color={ratio >= 1 ? c.expense : ahead ? c.warning : undefined}>
              {ratio >= 1
                ? `Excedido por ${money(spent - b.amount, false)}`
                : ahead
                  ? `Vas rápido: ${pct(ratio * 100)} gastado y va ${pct(dayFrac * 100)} del mes`
                  : `Quedan ${money(b.amount - spent, false)}`}
            </T>
          </View>
          <T variant="small">{money(spent, false)} / {money(b.amount, false)}</T>
        </View>
        <View>
          <ProgressBar value={ratio} />
          <View style={{ position: 'absolute', left: `${Math.min(100, dayFrac * 100)}%`, top: -3, width: 2, height: 14, backgroundColor: c.textMuted, opacity: 0.6 }} />
        </View>
      </Pressable>
    );
  };

  return (
    <Screen edges={[]}>
      <Card>
        <T variant="h3">Presupuesto total del mes</T>
        {totalBudget ? (
          row(totalBudget)
        ) : (
          <>
            <T variant="small" style={{ marginVertical: spacing.sm }}>Pon un tope general de gasto mensual. Te avisaremos al llegar al 80% y al 100%.</T>
            <Button title="Definir presupuesto total" small onPress={() => open(null)} />
          </>
        )}
      </Card>

      <SectionHeader title="Por categoría" action="+ Agregar" onAction={() => unbudgeted[0] && open(unbudgeted[0].id)} />
      <Card>
        {catBudgets.length ? catBudgets.map(row) : <T variant="muted" center>Aún no hay presupuestos por categoría.</T>}
      </Card>
      <Button title="✨ Sugerir con mi historial" variant="secondary" onPress={suggestAll} loading={bulkBusy} />
      <T variant="small" center style={{ marginTop: spacing.sm }}>La línea gris marca qué tanto del mes ha transcurrido.</T>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.budget ? 'Editar presupuesto' : 'Nuevo presupuesto'}>
        {editing && !editing.budget && editing.categoryId !== null && (
          <>
            <T variant="label" style={{ marginBottom: 6 }}>Categoría</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
              {unbudgeted.map((x) => (
                <Chip
                  key={x.id}
                  label={x.name}
                  color={x.color}
                  selected={editing.categoryId === x.id}
                  onPress={() => {
                    setEditing({ categoryId: x.id });
                    const s = suggestedBudget(history, x.id);
                    setAmount(s ? String(s) : '');
                  }}
                />
              ))}
            </View>
          </>
        )}
        <Input label="Monto mensual" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        {editing && suggestedBudget(history, editing.categoryId) > 0 && (
          <T variant="small" style={{ marginTop: -6, marginBottom: spacing.md }}>
            Promedio de los últimos 3 meses: {money(suggestedBudget(history, editing.categoryId), false)}
          </T>
        )}
        <T variant="label" style={{ marginBottom: 6 }}>Avisar al llegar a</T>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.lg }}>
          {[50, 70, 80, 90].map((p) => <Chip key={p} label={`${p}%`} selected={alertPct === p} onPress={() => setAlertPct(p)} />)}
        </View>
        <Button title="Guardar" onPress={onSave} loading={saveBudget.isPending} />
        {editing?.budget && (
          <Button
            title="Eliminar"
            variant="ghost"
            onPress={async () => {
              await delBudget.mutateAsync(editing.budget!.id);
              setEditing(null);
            }}
            style={{ marginTop: spacing.sm }}
          />
        )}
      </Sheet>
    </Screen>
  );
}
