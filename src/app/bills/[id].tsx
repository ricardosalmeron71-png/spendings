import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { CategoryGrid, DateField, MemberPicker, MethodPicker } from '@/components/Pickers';
import { TransactionRow } from '@/components/TransactionRow';
import { Button, Card, Chip, Input, Loading, Screen, SectionHeader, SwitchRow, T } from '@/components/ui';
import { useBills, useCategories, useMembers, usePayBill, usePaymentMethods, useSaveBill } from '@/hooks/queries';
import { today } from '@/lib/dates';
import { money, parseAmount } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import type { Bill, BillFrequency, Transaction } from '@/lib/types';

const FREQS: { value: BillFrequency; label: string }[] = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'once', label: 'Una vez' },
];

export default function BillEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bills = useBills();
  const bill = (bills.data ?? []).find((b) => b.id === id);
  if (id !== 'new' && !bill) return bills.isLoading ? <Loading /> : <Screen edges={[]}><T variant="muted" center>Este pago ya no existe.</T></Screen>;
  return <BillForm key={bill?.id ?? 'new'} id={id} bill={bill} />;
}

function BillForm({ id, bill }: { id: string; bill?: Bill }) {
  const isNew = id === 'new';
  const cats = (useCategories().data ?? []).filter((x) => x.kind === 'expense' && !x.archived);
  const members = useMembers().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const save = useSaveBill();
  const pay = usePayBill();

  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [frequency, setFrequency] = useState<BillFrequency>(bill?.frequency ?? 'monthly');
  const [due, setDue] = useState(bill?.next_due_date ?? today());
  const [cutoff, setCutoff] = useState<string | null>(bill?.cutoff_date ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(bill?.category_id ?? null);
  const [methodId, setMethodId] = useState<string | null>(bill?.payment_method_id ?? null);
  const [assigned, setAssigned] = useState<string | null>(bill?.assigned_to ?? null);
  const [remind, setRemind] = useState(bill?.remind_days_before ?? 3);
  const [autopay, setAutopay] = useState(bill?.autopay ?? false);
  const [active, setActive] = useState(bill?.active ?? true);
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [partial, setPartial] = useState('');


  const payments = useQuery({
    queryKey: ['bill-payments', id],
    enabled: !isNew,
    queryFn: async () =>
      unwrap(await supabase.from('transactions').select('*').eq('bill_id', id).order('occurred_on', { ascending: false }).limit(24)) as Transaction[],
  });

  async function onSave() {
    if (!name.trim() || parseAmount(amount) <= 0) return Alert.alert('Faltan datos', 'Nombre y monto son obligatorios');
    try {
      await save.mutateAsync({
        id: isNew ? undefined : id,
        name: name.trim(),
        amount: parseAmount(amount),
        frequency,
        next_due_date: due,
        cutoff_date: cutoff,
        category_id: categoryId,
        payment_method_id: methodId,
        assigned_to: assigned,
        remind_days_before: remind,
        autopay,
        active,
        notes: notes.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }

  async function onPay(full: boolean) {
    if (!bill) return;
    const value = full ? undefined : parseAmount(partial);
    if (!full && (!value || value <= 0)) return Alert.alert('Monto', 'Escribe el monto del abono');
    try {
      await pay.mutateAsync({ bill, amount: value, paymentMethodId: methodId });
      setPartial('');
      payments.refetch();
      Alert.alert('Listo ✅', full ? 'Pago registrado y fecha actualizada' : 'Abono registrado');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }

  async function onDelete() {
    Alert.alert('Eliminar pago recurrente', 'Los movimientos ya registrados se conservan.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('bills').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen edges={[]}>
      {bill && (
        <Card>
          <T variant="small">Pendiente del periodo</T>
          <T variant="h1">{money(bill.amount - bill.period_paid)}</T>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Button title="Pagar completo" icon="checkmark" small style={{ flex: 1 }} onPress={() => onPay(true)} loading={pay.isPending} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Input value={partial} onChangeText={setPartial} placeholder="Abono parcial $" keyboardType="decimal-pad" />
            </View>
            <Button title="Abonar" variant="secondary" small onPress={() => onPay(false)} style={{ marginTop: 4 }} />
          </View>
        </Card>
      )}

      <Input label="Nombre" value={name} onChangeText={setName} placeholder="Luz, Cable / Internet, Amex…" />
      <Input label="Monto" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

      <T variant="label" style={{ marginBottom: 6 }}>Frecuencia</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}>
        {FREQS.map((f) => <Chip key={f.value} label={f.label} selected={frequency === f.value} onPress={() => setFrequency(f.value)} />)}
      </ScrollView>

      <DateField label="Fecha límite de pago (próxima)" value={due} onChange={setDue} />
      {cutoff ? (
        <DateField label="Fecha de corte (tarjetas)" value={cutoff} onChange={setCutoff} />
      ) : (
        <Button title="Agregar fecha de corte" variant="ghost" small onPress={() => setCutoff(today())} style={{ alignSelf: 'flex-start', marginBottom: spacing.sm }} />
      )}

      <T variant="label" style={{ marginBottom: 6 }}>Avisarme antes</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}>
        {[0, 1, 2, 3, 5, 7, 10].map((d) => (
          <Chip key={d} label={d === 0 ? 'El mismo día' : `${d} días`} selected={remind === d} onPress={() => setRemind(d)} />
        ))}
      </ScrollView>

      <T variant="label" style={{ marginBottom: 6 }}>Se paga con</T>
      <View style={{ marginBottom: spacing.md }}>
        <MethodPicker methods={methods} value={methodId} onChange={setMethodId} />
      </View>

      {members.length > 1 && (
        <>
          <T variant="label" style={{ marginBottom: 6 }}>Responsable (vacío = todos reciben aviso)</T>
          <Card>
            <MemberPicker members={members} value={assigned ?? ''} onChange={(uid) => setAssigned(assigned === uid ? null : uid)} />
          </Card>
        </>
      )}

      <T variant="label" style={{ marginBottom: 6 }}>Categoría</T>
      <Card style={{ paddingHorizontal: spacing.sm }}>
        <CategoryGrid categories={cats} value={categoryId} onChange={setCategoryId} />
      </Card>

      <Card style={{ paddingVertical: 0 }}>
        <SwitchRow title="Cargo automático" subtitle="Se domicilia a la tarjeta/cuenta" value={autopay} onChange={setAutopay} />
        <SwitchRow title="Activo" value={active} onChange={setActive} />
      </Card>
      <Input label="Notas" value={notes} onChangeText={setNotes} placeholder="Número de contrato, referencia…" multiline />

      <Button title={isNew ? 'Crear pago recurrente' : 'Guardar'} icon="save" onPress={onSave} loading={save.isPending} />
      {!isNew && <Button title="Eliminar" variant="ghost" onPress={onDelete} style={{ marginTop: spacing.sm }} />}

      {!isNew && (payments.data?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Historial de pagos" />
          <Card>
            {payments.data!.map((t) => (
              <TransactionRow key={t.id} t={t} showDate category={cats.find((x) => x.id === t.category_id)} member={members.find((m) => m.user_id === t.user_id)} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
