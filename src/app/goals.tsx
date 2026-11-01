import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { DateField } from '@/components/Pickers';
import { Button, Card, Chip, EmptyState, Input, ProgressBar, Screen, Sheet, T } from '@/components/ui';
import { useGoals } from '@/hooks/queries';
import { daysBetween, fromISODate, today } from '@/lib/dates';
import { money, parseAmount, pct } from '@/lib/format';
import { useGroup } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { CATEGORY_COLORS, spacing, useColors } from '@/lib/theme';
import type { SavingsGoal } from '@/lib/types';

const EMOJIS = ['🎯', '🏖️', '🚗', '🏠', '🛡️', '🎓', '💍', '👶', '📱', '✈️', '🎄', '💻'];

export default function Goals() {
  const c = useColors();
  const qc = useQueryClient();
  const { groupId } = useGroup();
  const goals = useGoals().data ?? [];
  const [edit, setEdit] = useState<Partial<SavingsGoal> | null>(null);
  const [contrib, setContrib] = useState<SavingsGoal | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['goals', groupId] });

  async function saveGoal() {
    if (!edit?.name || !edit.target_amount) return Alert.alert('Faltan datos', 'Nombre y monto objetivo');
    setBusy(true);
    const payload = {
      name: edit.name,
      emoji: edit.emoji ?? '🎯',
      target_amount: edit.target_amount,
      target_date: edit.target_date ?? null,
      color: edit.color ?? c.income,
      group_id: groupId,
    };
    const res = edit.id
      ? await supabase.from('savings_goals').update(payload).eq('id', edit.id)
      : await supabase.from('savings_goals').insert(payload);
    setBusy(false);
    if (res.error) return Alert.alert('Error', res.error.message);
    setEdit(null);
    refresh();
  }

  async function addContribution(sign: 1 | -1) {
    if (!contrib) return;
    const v = parseAmount(contribAmount);
    if (v <= 0) return;
    setBusy(true);
    const { error } = await supabase.rpc('contribute_goal', { p_goal: contrib.id, p_amount: v * sign });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setContrib(null);
    setContribAmount('');
    refresh();
  }

  const totalSaved = goals.reduce((s, g) => s + Number(g.current_amount), 0);

  return (
    <Screen edges={[]}>
      {goals.length > 0 && (
        <Card>
          <T variant="small">Ahorrado en todas las metas</T>
          <T variant="h1" color={c.income}>{money(totalSaved, false)}</T>
        </Card>
      )}
      {goals.length === 0 && (
        <EmptyState
          icon="flag"
          title="Crea tu primera meta"
          body="Fondo de emergencia, vacaciones, enganche del carro… Te diremos cuánto apartar por semana."
          action="Nueva meta"
          onAction={() => setEdit({ emoji: '🛡️', name: 'Fondo de emergencia' })}
        />
      )}
      {goals.map((g) => {
        const ratio = g.target_amount ? g.current_amount / g.target_amount : 0;
        const remaining = Math.max(0, g.target_amount - g.current_amount);
        const days = g.target_date ? daysBetween(today(), g.target_date) : null;
        const perWeek = days && days > 0 ? remaining / (days / 7) : null;
        return (
          <Card key={g.id} onPress={() => setContrib(g)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
              <T style={{ fontSize: 32 }}>{g.emoji}</T>
              <View style={{ flex: 1 }}>
                <T variant="h3">{g.name}</T>
                <T variant="small">
                  {money(g.current_amount, false)} de {money(g.target_amount, false)} · {pct(ratio * 100)}
                </T>
              </View>
              <Pressable onPress={() => setEdit(g)} hitSlop={10}><T color={c.primary}>Editar</T></Pressable>
            </View>
            <ProgressBar value={ratio} color={g.color} height={10} />
            <T variant="small" style={{ marginTop: 6 }}>
              {g.completed
                ? '🎉 ¡Meta cumplida!'
                : perWeek
                  ? `Aparta ${money(perWeek, false)}/semana para llegar el ${fromISODate(g.target_date!).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : days !== null && days <= 0
                    ? `La fecha pasó; faltan ${money(remaining, false)}`
                    : `Faltan ${money(remaining, false)}`}
            </T>
          </Card>
        );
      })}
      {goals.length > 0 && <Button title="Nueva meta" icon="add" onPress={() => setEdit({ emoji: '🎯' })} />}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar meta' : 'Nueva meta'}>
        <ScrollView horizontal contentContainerStyle={{ gap: 8, marginBottom: spacing.md }} showsHorizontalScrollIndicator={false}>
          {EMOJIS.map((e) => <Chip key={e} label={e} selected={edit?.emoji === e} onPress={() => setEdit({ ...edit, emoji: e })} />)}
        </ScrollView>
        <Input label="Nombre" value={edit?.name ?? ''} onChangeText={(name) => setEdit({ ...edit, name })} placeholder="Vacaciones 2027" />
        <Input
          label="Monto objetivo"
          value={edit?.target_amount ? String(edit.target_amount) : ''}
          onChangeText={(v) => setEdit({ ...edit, target_amount: parseAmount(v) })}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        {edit?.target_date ? (
          <DateField label="Fecha objetivo" value={edit.target_date} onChange={(d) => setEdit({ ...edit, target_date: d })} />
        ) : (
          <Button title="Agregar fecha objetivo" variant="ghost" small onPress={() => setEdit({ ...edit, target_date: today() })} style={{ alignSelf: 'flex-start' }} />
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: spacing.md, flexWrap: 'wrap' }}>
          {CATEGORY_COLORS.slice(0, 8).map((col) => (
            <Pressable key={col} onPress={() => setEdit({ ...edit, color: col })} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: edit?.color === col ? 3 : 0, borderColor: c.text }} />
          ))}
        </View>
        <Button title="Guardar" onPress={saveGoal} loading={busy} />
        {edit?.id && (
          <Button
            title="Eliminar meta"
            variant="ghost"
            onPress={async () => {
              await supabase.from('savings_goals').delete().eq('id', edit.id!);
              setEdit(null);
              refresh();
            }}
          />
        )}
      </Sheet>

      <Sheet visible={!!contrib} onClose={() => setContrib(null)} title={`${contrib?.emoji ?? ''} ${contrib?.name ?? ''}`}>
        <Input label="Monto" value={contribAmount} onChangeText={setContribAmount} keyboardType="decimal-pad" placeholder="0" autoFocus />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title="Retirar" variant="secondary" style={{ flex: 1 }} onPress={() => addContribution(-1)} />
          <Button title="Aportar" variant="success" style={{ flex: 1 }} onPress={() => addContribution(1)} loading={busy} />
        </View>
      </Sheet>
    </Screen>
  );
}
