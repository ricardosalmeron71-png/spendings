import { router, Stack } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, EmptyState, IconCircle, ProgressBar, Screen, SectionHeader, T } from '@/components/ui';
import { useBills, useCategories, usePayBill, usePaymentMethods } from '@/hooks/queries';
import { daysBetween, relativeDue, today } from '@/lib/dates';
import { money } from '@/lib/format';
import { spacing, useColors } from '@/lib/theme';
import type { Bill } from '@/lib/types';

const FREQ: Record<string, string> = {
  once: 'Una vez', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', bimonthly: 'Bimestral', quarterly: 'Trimestral', yearly: 'Anual',
};
const MONTHLY_FACTOR: Record<string, number> = { once: 0, weekly: 4.33, biweekly: 2.17, monthly: 1, bimonthly: 0.5, quarterly: 1 / 3, yearly: 1 / 12 };

export default function Bills() {
  const c = useColors();
  const bills = useBills().data ?? [];
  const cats = useCategories().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const pay = usePayBill();
  const t0 = today();

  const active = bills.filter((b) => b.active);
  const overdue = active.filter((b) => b.next_due_date < t0 && b.amount - b.period_paid > 0);
  const week = active.filter((b) => b.next_due_date >= t0 && daysBetween(t0, b.next_due_date) <= 7);
  const later = active.filter((b) => daysBetween(t0, b.next_due_date) > 7);
  const monthlyCommitment = active.reduce((s, b) => s + Number(b.amount) * MONTHLY_FACTOR[b.frequency], 0);

  function quickPay(b: Bill) {
    Alert.alert(`Pagar ${b.name}`, `Registrar ${money(b.amount - b.period_paid)} como pagado hoy`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pagar', onPress: () => pay.mutate({ bill: b }) },
    ]);
  }

  const renderBill = (b: Bill) => {
    const cat = cats.find((x) => x.id === b.category_id);
    const method = methods.find((m) => m.id === b.payment_method_id);
    const late = b.next_due_date < t0;
    const remaining = b.amount - b.period_paid;
    return (
      <Pressable key={b.id} onPress={() => router.push(`/bills/${b.id}`)} style={{ paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon={cat?.icon ?? 'receipt'} color={late ? c.expense : cat?.color ?? c.info} size={42} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }} numberOfLines={1}>{b.name}</T>
            <T variant="small" color={late ? c.expense : undefined}>
              {relativeDue(b.next_due_date)} · {FREQ[b.frequency]}{method ? ` · ${method.name}` : ''}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="money">{money(remaining, false)}</T>
            <Pressable onPress={() => quickPay(b)} hitSlop={8}>
              <T color={c.primary} style={{ fontWeight: '700', fontSize: 13 }}>Pagar</T>
            </Pressable>
          </View>
        </View>
        {b.period_paid > 0 && (
          <View style={{ marginTop: 8, marginLeft: 54 }}>
            <ProgressBar value={b.period_paid / b.amount} color={c.income} height={6} />
            <T variant="small" style={{ marginTop: 2 }}>Abonado {money(b.period_paid, false)} de {money(b.amount, false)}</T>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerRight: () => <Pressable onPress={() => router.push('/bills/new')}><T color={c.primary} style={{ fontWeight: '700' }}>+ Nuevo</T></Pressable> }} />
      <Card>
        <T variant="small">Compromiso mensual estimado</T>
        <T variant="h1">{money(monthlyCommitment, false)}</T>
        <T variant="small">{active.length} pagos activos{overdue.length ? ` · ${overdue.length} vencidos` : ''}</T>
      </Card>
      {active.length === 0 && (
        <EmptyState
          icon="calendar"
          title="Sin pagos recurrentes"
          body="Agrega luz, agua, internet, renta, tarjetas o colegiaturas. Te avisaremos antes de la fecha límite, aunque la app esté cerrada."
          action="Agregar pago"
          onAction={() => router.push('/bills/new')}
        />
      )}
      {overdue.length > 0 && (<><SectionHeader title="🚨 Vencidos" /><Card>{overdue.map(renderBill)}</Card></>)}
      {week.length > 0 && (<><SectionHeader title="Esta semana" /><Card>{week.map(renderBill)}</Card></>)}
      {later.length > 0 && (<><SectionHeader title="Próximamente" /><Card>{later.map(renderBill)}</Card></>)}
      {bills.some((b) => !b.active) && (
        <>
          <SectionHeader title="Inactivos" />
          <Card>{bills.filter((b) => !b.active).map((b) => (
            <Pressable key={b.id} onPress={() => router.push(`/bills/${b.id}`)} style={{ paddingVertical: 8 }}>
              <T variant="muted">{b.name} · {money(b.amount, false)}</T>
            </Pressable>
          ))}</Card>
        </>
      )}
      <Button title="Agregar pago recurrente" icon="add" onPress={() => router.push('/bills/new')} />
    </Screen>
  );
}
