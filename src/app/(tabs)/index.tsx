import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Donut } from '@/components/charts';
import { TransactionRow } from '@/components/TransactionRow';
import { Badge, Button, Card, GradientCard, IconCircle, ProgressBar, Screen, SectionHeader, T } from '@/components/ui';
import {
  useBills,
  useBudgets,
  useCategories,
  useHistory,
  useMarkNoIncome,
  useMembers,
  useNotifications,
  usePayBill,
  usePaymentMethods,
  useWeeklyStatus, EMPTY } from '@/hooks/queries';
import { addMonths, monthLabel, monthStart, relativeDue, today, WEEKDAYS } from '@/lib/dates';
import { money, pct } from '@/lib/format';
import { buildInsights, byCategory, projectMonthEnd, totals } from '@/lib/insights';
import { useGroup, useSession } from '@/lib/session';
import { radius, spacing, useColors } from '@/lib/theme';
import type { Bill } from '@/lib/types';

export default function Home() {
  const c = useColors();
  const { profile } = useSession();
  const { group, userId } = useGroup();
  const [month, setMonth] = useState(monthStart(today()));

  const history = useHistory(6);
  const categories = useCategories();
  const members = useMembers();
  const methods = usePaymentMethods();
  const bills = useBills();
  const budgets = useBudgets();
  const weekly = useWeeklyStatus();
  const notifications = useNotifications();
  const markNoIncome = useMarkNoIncome();
  const payBill = usePayBill();

  const all = history.data ?? EMPTY;
  const cats = categories.data ?? EMPTY;
  const monthTx = useMemo(() => all.filter((t) => t.occurred_on.slice(0, 7) === month.slice(0, 7)), [all, month]);
  const tot = totals(monthTx);
  const isCurrentMonth = month.slice(0, 7) === today().slice(0, 7);
  const projected = projectMonthEnd(all, month);
  const slices = byCategory(monthTx, cats);
  const totalBudget = budgets.data?.find((b) => b.category_id === null);
  const insights = useMemo(
    () => buildInsights({ history: all, categories: cats, budgets: budgets.data ?? [], bills: bills.data ?? [], month }),
    [all, cats, budgets.data, bills.data, month],
  );
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  const myWeekly = weekly.data?.find((w) => w.user_id === userId);
  const upcoming = (bills.data ?? []).filter((b) => b.active && b.amount - b.period_paid > 0).slice(0, 5);

  const refreshing = history.isRefetching || bills.isRefetching;
  const onRefresh = () => {
    history.refetch();
    bills.refetch();
    weekly.refetch();
    notifications.refetch();
    budgets.refetch();
  };

  const memberById = new Map((members.data ?? []).map((m) => [m.user_id, m]));
  const catById = new Map(cats.map((x) => [x.id, x]));
  const methodById = new Map((methods.data ?? []).map((m) => [m.id, m]));

  function confirmPay(b: Bill) {
    Alert.alert(`Pagar ${b.name}`, `¿Registrar pago de ${money(b.amount - b.period_paid)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pago parcial', onPress: () => router.push(`/bills/${b.id}`) },
      { text: 'Pagar', onPress: () => payBill.mutate({ bill: b }) },
    ]);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Encabezado */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <Pressable onPress={() => router.push('/more')}>
          <Avatar user={profile} size={46} />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/group')}>
          <T variant="muted">Hola, {profile?.full_name?.split(' ')[0] ?? ''} 👋</T>
          <T variant="h3" numberOfLines={1}>
            {group.emoji} {group.name} <Ionicons name="chevron-down" size={14} color={c.textMuted} />
          </T>
        </Pressable>
        <Pressable onPress={() => router.push('/notifications')} style={{ padding: 8 }}>
          <Ionicons name="notifications-outline" size={26} color={c.text} />
          <Badge count={unread} />
        </Pressable>
        <Pressable onPress={() => router.push('/more')} style={{ padding: 8 }}>
          <Ionicons name="grid-outline" size={24} color={c.text} />
        </Pressable>
      </View>

      {/* Balance */}
      <GradientCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, -1))}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <T color="#ffffffcc" style={{ fontWeight: '600' }}>{monthLabel(month)}</T>
          <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, 1))} disabled={isCurrentMonth}>
            <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? '#ffffff44' : '#fff'} />
          </Pressable>
        </View>
        <T color="#ffffffaa" center style={{ marginTop: spacing.md }}>Balance del mes</T>
        <T variant="h1" color="#fff" center style={{ fontSize: 38, marginVertical: 4 }}>
          {tot.net < 0 ? '-' : ''}
          {money(Math.abs(tot.net))}
        </T>
        {tot.income > 0 && (
          <T color="#ffffffcc" center variant="small">
            Ahorro {pct(Math.max(0, tot.savingsRate))} de tus ingresos
          </T>
        )}
        <View style={{ flexDirection: 'row', marginTop: spacing.lg, gap: spacing.md }}>
          {[
            { label: 'Ingresos', value: tot.income, icon: 'arrow-down' as const },
            { label: 'Gastos', value: tot.expense, icon: 'arrow-up' as const },
          ].map((x) => (
            <View key={x.label} style={{ flex: 1, backgroundColor: '#ffffff1f', borderRadius: radius.md, padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={x.icon} size={14} color="#fff" />
                <T variant="small" color="#ffffffcc">{x.label}</T>
              </View>
              <T variant="money" color="#fff" style={{ fontSize: 18, marginTop: 2 }}>{money(x.value, false)}</T>
            </View>
          ))}
        </View>
        {isCurrentMonth && tot.expense > 0 && (
          <T variant="small" color="#ffffffbb" center style={{ marginTop: spacing.md }}>
            Proyección de gasto al cierre: {money(projected, false)}
          </T>
        )}
      </GradientCard>

      {/* Registro semanal de ingresos */}
      {weekly.data && weekly.data.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{ flex: 1 }}>
              <T variant="h3">Registro semanal de ingresos</T>
              <T variant="small">Cada {WEEKDAYS[group.income_check_weekday].toLowerCase()} se revisa quién falta</T>
            </View>
            <IconCircle icon="people" color={c.primary} size={36} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.lg }}>
            {weekly.data.map((w) => {
              const color = { registered: c.income, no_income: c.info, exempt: c.textMuted, missing: c.warning }[w.status];
              const label = { registered: money(w.income_total, false), no_income: 'Sin ingreso', exempt: 'Exento', missing: 'Pendiente' }[w.status];
              return (
                <View key={w.user_id} style={{ alignItems: 'center', width: 70 }}>
                  <Avatar user={w} size={46} ring={color} />
                  <T variant="small" numberOfLines={1} style={{ marginTop: 4, fontWeight: '600', color: c.text }}>
                    {w.full_name.split(' ')[0]}
                  </T>
                  <T variant="small" color={color} numberOfLines={1}>{label}</T>
                </View>
              );
            })}
          </ScrollView>
          {myWeekly?.status === 'missing' && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Registrar ingreso" icon="add" small style={{ flex: 1 }} onPress={() => router.push('/transaction/new?kind=income')} />
              <Button title="No tuve" variant="secondary" small onPress={() => markNoIncome.mutate()} loading={markNoIncome.isPending} />
            </View>
          )}
        </Card>
      )}

      {/* Consejos inteligentes */}
      <SectionHeader title="Para ti" action="Preguntar a Fin" onAction={() => router.push('/assistant')} />
      {insights.length === 0 ? (
        <Card onPress={() => router.push('/assistant')}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconCircle icon="sparkles" color={c.primary} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>Todo en orden ✨</T>
              <T variant="small">Pregúntale a Fin cómo optimizar tus ingresos o armar tu presupuesto.</T>
            </View>
          </View>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
          {insights.slice(0, 6).map((i) => (
            <Card key={i.id} style={{ width: 270, marginBottom: 0 }} onPress={i.action ? () => router.push(i.action!.href as never) : undefined}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: 6 }}>
                <IconCircle icon={i.icon} color={i.color} size={32} />
                <T style={{ fontWeight: '700', flex: 1 }} numberOfLines={2}>{i.title}</T>
              </View>
              <T variant="small" numberOfLines={4}>{i.body}</T>
              {i.action && <T color={c.primary} style={{ fontWeight: '700', marginTop: 8, fontSize: 13 }}>{i.action.label} →</T>}
            </Card>
          ))}
        </ScrollView>
      )}

      {/* Presupuesto */}
      {totalBudget && (
        <Card onPress={() => router.push('/budgets')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <T style={{ fontWeight: '700' }}>Presupuesto del mes</T>
            <T variant="muted">{money(tot.expense, false)} / {money(totalBudget.amount, false)}</T>
          </View>
          <ProgressBar value={totalBudget.amount ? tot.expense / totalBudget.amount : 0} height={10} />
          <T variant="small" style={{ marginTop: 6 }}>
            {tot.expense <= totalBudget.amount
              ? `Te quedan ${money(totalBudget.amount - tot.expense, false)}`
              : `Excedido por ${money(tot.expense - totalBudget.amount, false)}`}
          </T>
        </Card>
      )}

      {/* Próximos pagos */}
      <SectionHeader title="Próximos pagos" action="Ver todos" onAction={() => router.push('/bills')} />
      <Card>
        {upcoming.length === 0 ? (
          <Pressable onPress={() => router.push('/bills/new')}>
            <T variant="muted" center>Agrega luz, internet, renta, tarjetas… y te avisamos antes de que venzan. ➕</T>
          </Pressable>
        ) : (
          upcoming.map((b) => {
            const overdue = b.next_due_date < today();
            const cat = b.category_id ? catById.get(b.category_id) : undefined;
            return (
              <Pressable key={b.id} onPress={() => router.push(`/bills/${b.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 }}>
                <IconCircle icon={cat?.icon ?? 'receipt'} color={overdue ? c.expense : cat?.color ?? c.info} size={40} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }} numberOfLines={1}>{b.name}</T>
                  <T variant="small" color={overdue ? c.expense : undefined}>
                    {relativeDue(b.next_due_date)}
                    {b.period_paid > 0 ? ` · abonado ${money(b.period_paid, false)}` : ''}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T variant="money">{money(b.amount - b.period_paid, false)}</T>
                  <Pressable onPress={() => confirmPay(b)} hitSlop={6}>
                    <T color={c.primary} style={{ fontWeight: '700', fontSize: 13 }}>Pagar</T>
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </Card>

      {/* Gasto por categoría */}
      {slices.length > 0 && (
        <>
          <SectionHeader title="¿En qué se va?" action="Métricas" onAction={() => router.push('/metrics')} />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <Donut data={slices.slice(0, 6)} size={130} thickness={16} centerValue={money(tot.expense, false)} centerLabel="gastado" />
              <View style={{ flex: 1, gap: 6 }}>
                {slices.slice(0, 5).map((s) => (
                  <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                    <T variant="small" style={{ flex: 1, color: c.text }} numberOfLines={1}>{s.label}</T>
                    <T variant="small">{pct((s.value / tot.expense) * 100)}</T>
                  </View>
                ))}
              </View>
            </View>
          </Card>
        </>
      )}

      {/* Últimos movimientos */}
      <SectionHeader title="Últimos movimientos" action="Ver todos" onAction={() => router.push('/transactions')} />
      <Card>
        {monthTx.length === 0 ? (
          <T variant="muted" center>Aún no hay movimientos este mes. Toca ➕ para registrar el primero.</T>
        ) : (
          monthTx.slice(0, 6).map((t) => (
            <TransactionRow
              key={t.id}
              t={t}
              showDate
              category={t.category_id ? catById.get(t.category_id) : undefined}
              member={memberById.get(t.user_id)}
              method={t.payment_method_id ? methodById.get(t.payment_method_id) : undefined}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
