import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Divider, IconCircle, Input, Screen, Segmented, Sheet, SwitchRow, T } from '@/components/ui';
import { useCategories } from '@/hooks/queries';
import { useGroup } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { CATEGORY_COLORS, CATEGORY_ICONS, spacing, useColors } from '@/lib/theme';
import type { Category, TxnKind } from '@/lib/types';

const TYPES = ['Casa', 'Servicio', 'Carro', 'Comida', 'Entretenimiento', 'Médico', 'Ropa', 'Compra', 'Tarjeta', 'Educación', 'Baby', 'Fonacot', 'Otros', 'N/A'];

export default function Categories() {
  const c = useColors();
  const qc = useQueryClient();
  const { groupId } = useGroup();
  const cats = useCategories().data ?? [];
  const [kind, setKind] = useState<TxnKind>('expense');
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [busy, setBusy] = useState(false);

  const list = cats.filter((x) => x.kind === kind);

  async function save() {
    if (!edit?.name?.trim()) return;
    setBusy(true);
    const payload = {
      name: edit.name.trim(),
      kind,
      type: edit.type ?? 'Otros',
      icon: edit.icon ?? 'pricetag',
      color: edit.color ?? CATEGORY_COLORS[0],
      is_essential: edit.is_essential ?? false,
      archived: edit.archived ?? false,
      group_id: groupId,
    };
    const res = edit.id ? await supabase.from('categories').update(payload).eq('id', edit.id) : await supabase.from('categories').insert(payload);
    setBusy(false);
    if (res.error) return Alert.alert('Error', res.error.message);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ['categories', groupId] });
  }

  return (
    <Screen edges={[]}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Egresos' }, { value: 'income', label: 'Ingresos' }]} />
      <Card style={{ paddingVertical: 4 }}>
        {list.map((x, i) => (
          <View key={x.id}>
            {i > 0 && <Divider />}
            <Pressable onPress={() => setEdit(x)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, opacity: x.archived ? 0.4 : 1 }}>
              <IconCircle icon={x.icon} color={x.color} size={38} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{x.name}</T>
                <T variant="small">{x.type}{x.is_essential ? ' · esencial' : ''}{x.archived ? ' · archivada' : ''}</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </Pressable>
          </View>
        ))}
      </Card>
      <Button title="Nueva categoría" icon="add" onPress={() => setEdit({ color: CATEGORY_COLORS[0], icon: 'pricetag', type: kind === 'income' ? 'N/A' : 'Otros' })} />

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar categoría' : 'Nueva categoría'}>
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          <IconCircle icon={edit?.icon ?? 'pricetag'} color={edit?.color ?? c.primary} size={64} />
        </View>
        <Input label="Nombre" value={edit?.name ?? ''} onChangeText={(name) => setEdit({ ...edit, name })} placeholder="Ej. Colegiatura" />
        <T variant="label" style={{ marginBottom: 6 }}>Tipo (agrupador)</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
          {TYPES.map((t) => (
            <Pressable key={t} onPress={() => setEdit({ ...edit, type: t })} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: edit?.type === t ? c.primary : c.cardAlt }}>
              <T variant="small" color={edit?.type === t ? '#fff' : c.text}>{t}</T>
            </Pressable>
          ))}
        </View>
        <T variant="label" style={{ marginBottom: 6 }}>Color</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
          {CATEGORY_COLORS.map((col) => (
            <Pressable key={col} onPress={() => setEdit({ ...edit, color: col })} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: edit?.color === col ? 3 : 0, borderColor: c.text }} />
          ))}
        </View>
        <T variant="label" style={{ marginBottom: 6 }}>Ícono</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
          {CATEGORY_ICONS.map((ic) => (
            <Pressable key={ic} onPress={() => setEdit({ ...edit, icon: ic })} style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: edit?.icon === ic ? (edit?.color ?? c.primary) + '33' : c.cardAlt }}>
              <Ionicons name={ic} size={20} color={edit?.icon === ic ? edit?.color ?? c.primary : c.textMuted} />
            </Pressable>
          ))}
        </View>
        {kind === 'expense' && (
          <SwitchRow title="Esencial (necesidad)" subtitle="Se usa en el plan 50/30/20" value={!!edit?.is_essential} onChange={(v) => setEdit({ ...edit, is_essential: v })} />
        )}
        {edit?.id && <SwitchRow title="Archivada" subtitle="Ocultar al registrar" value={!!edit?.archived} onChange={(v) => setEdit({ ...edit, archived: v })} />}
        <Button title="Guardar" onPress={save} loading={busy} style={{ marginTop: spacing.md }} />
      </Sheet>
    </Screen>
  );
}
