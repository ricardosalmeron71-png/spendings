import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { MemberPicker } from '@/components/Pickers';
import { Button, Card, Chip, Divider, IconCircle, Input, Screen, Sheet, SwitchRow, T } from '@/components/ui';
import { useMembers, useMonthTransactions, usePaymentMethods } from '@/hooks/queries';
import { today } from '@/lib/dates';
import { money, parseAmount } from '@/lib/format';
import { useGroup } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { CATEGORY_COLORS, spacing, useColors } from '@/lib/theme';
import type { PaymentKind, PaymentMethod } from '@/lib/types';

const KINDS: { value: PaymentKind; label: string; icon: string }[] = [
  { value: 'credit', label: 'Crédito', icon: 'card' },
  { value: 'debit', label: 'Débito', icon: 'card-outline' },
  { value: 'payroll', label: 'Nómina', icon: 'briefcase' },
  { value: 'cash', label: 'Efectivo', icon: 'cash' },
  { value: 'savings', label: 'Ahorro', icon: 'wallet' },
  { value: 'other', label: 'Otro', icon: 'ellipsis-horizontal' },
];

export default function PaymentMethods() {
  const c = useColors();
  const qc = useQueryClient();
  const { groupId } = useGroup();
  const methods = usePaymentMethods().data ?? [];
  const members = useMembers().data ?? [];
  const monthTx = useMonthTransactions(today()).data ?? [];
  const [edit, setEdit] = useState<Partial<PaymentMethod> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit?.name?.trim()) return;
    setBusy(true);
    const payload = {
      name: edit.name.trim(),
      kind: edit.kind ?? 'debit',
      institution: edit.institution ?? null,
      last4: edit.last4 ?? null,
      credit_limit: edit.credit_limit ?? null,
      cut_day: edit.cut_day ?? null,
      due_day: edit.due_day ?? null,
      color: edit.color ?? CATEGORY_COLORS[4],
      owner_id: edit.owner_id ?? null,
      archived: edit.archived ?? false,
      group_id: groupId,
    };
    const res = edit.id ? await supabase.from('payment_methods').update(payload).eq('id', edit.id) : await supabase.from('payment_methods').insert(payload);
    setBusy(false);
    if (res.error) return Alert.alert('Error', res.error.message);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ['payment_methods', groupId] });
  }

  return (
    <Screen edges={[]}>
      <Card style={{ paddingVertical: 4 }}>
        {methods.map((m, i) => {
          const spent = monthTx.filter((t) => t.kind === 'expense' && t.payment_method_id === m.id).reduce((s, t) => s + Number(t.amount), 0);
          const owner = members.find((x) => x.user_id === m.owner_id);
          return (
            <View key={m.id}>
              {i > 0 && <Divider />}
              <Pressable onPress={() => setEdit(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, opacity: m.archived ? 0.4 : 1 }}>
                <IconCircle icon={KINDS.find((k) => k.value === m.kind)?.icon ?? 'card'} color={m.color} size={40} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{m.name}{m.last4 ? ` ••${m.last4}` : ''}</T>
                  <T variant="small">
                    {KINDS.find((k) => k.value === m.kind)?.label}
                    {owner ? ` · ${owner.profiles.full_name.split(' ')[0]}` : ''}
                    {m.cut_day ? ` · corte ${m.cut_day}` : ''}
                    {m.due_day ? ` · pago ${m.due_day}` : ''}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T variant="small">Este mes</T>
                  <T variant="money" style={{ fontSize: 14 }}>{money(spent, false)}</T>
                  {m.credit_limit ? <T variant="small">{Math.round((spent / m.credit_limit) * 100)}% del límite</T> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>
      <Button title="Agregar forma de pago" icon="add" onPress={() => setEdit({ kind: 'credit', color: CATEGORY_COLORS[4] })} />
      <T variant="small" center style={{ marginTop: spacing.md }}>
        Tip: con día de corte y día de pago, crea un pago recurrente para que te recordemos pagar la tarjeta sin intereses.
      </T>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar forma de pago' : 'Nueva forma de pago'}>
        <Input label="Nombre" value={edit?.name ?? ''} onChangeText={(name) => setEdit({ ...edit, name })} placeholder="HSBC 2Now, AMEX, Nómina Ricardo…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}>
          {KINDS.map((k) => <Chip key={k.value} label={k.label} selected={edit?.kind === k.value} onPress={() => setEdit({ ...edit, kind: k.value })} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Input label="Banco" value={edit?.institution ?? ''} onChangeText={(institution) => setEdit({ ...edit, institution })} placeholder="HSBC" /></View>
          <View style={{ width: 110 }}><Input label="Últimos 4" value={edit?.last4 ?? ''} onChangeText={(last4) => setEdit({ ...edit, last4: last4.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" placeholder="1234" /></View>
        </View>
        {edit?.kind === 'credit' && (
          <>
            <Input label="Límite de crédito" value={edit?.credit_limit ? String(edit.credit_limit) : ''} onChangeText={(v) => setEdit({ ...edit, credit_limit: parseAmount(v) || null })} keyboardType="decimal-pad" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Input label="Día de corte" value={edit?.cut_day ? String(edit.cut_day) : ''} onChangeText={(v) => setEdit({ ...edit, cut_day: Math.min(31, Number(v) || 0) || null })} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Input label="Día límite de pago" value={edit?.due_day ? String(edit.due_day) : ''} onChangeText={(v) => setEdit({ ...edit, due_day: Math.min(31, Number(v) || 0) || null })} keyboardType="number-pad" /></View>
            </View>
          </>
        )}
        {members.length > 1 && (
          <>
            <T variant="label" style={{ marginBottom: 6 }}>Titular</T>
            <MemberPicker members={members} value={edit?.owner_id ?? ''} onChange={(owner_id) => setEdit({ ...edit, owner_id })} />
          </>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: spacing.md }}>
          {CATEGORY_COLORS.map((col) => (
            <Pressable key={col} onPress={() => setEdit({ ...edit, color: col })} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: edit?.color === col ? 3 : 0, borderColor: c.text }} />
          ))}
        </View>
        {edit?.id && <SwitchRow title="Archivada" value={!!edit?.archived} onChange={(archived) => setEdit({ ...edit, archived })} />}
        <Button title="Guardar" onPress={save} loading={busy} />
      </Sheet>
    </Screen>
  );
}
