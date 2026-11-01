import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { CategoryGrid, DateField, MemberPicker, MethodPicker } from '@/components/Pickers';
import { Button, Card, Input, Loading, Screen, Segmented, T } from '@/components/ui';
import { useCategories, useHistory, useMembers, usePaymentMethods, useSaveTransaction, useTransaction, EMPTY } from '@/hooks/queries';
import { today } from '@/lib/dates';
import { parseAmount } from '@/lib/format';
import { suggestCategory } from '@/lib/insights';
import { useGroup } from '@/lib/session';
import { radius, spacing, useColors } from '@/lib/theme';
import type { Transaction, TxnKind } from '@/lib/types';
import { pickImages, uploadEvidence, type PickedImage } from '@/lib/upload';

export default function NewTransaction() {
  const params = useLocalSearchParams<{ id?: string; kind?: TxnKind; date?: string }>();
  const existing = useTransaction(params.id);
  if (params.id && !existing.data) return <Loading />;
  return <TransactionForm key={existing.data?.id ?? 'new'} initial={existing.data ?? undefined} params={params} />;
}

function TransactionForm({
  initial,
  params,
}: {
  initial?: Transaction;
  params: { id?: string; kind?: TxnKind; date?: string };
}) {
  const c = useColors();
  const qc = useQueryClient();
  const { groupId, userId } = useGroup();
  const editing = !!initial;

  const [kind, setKind] = useState<TxnKind>(initial?.kind ?? (params.kind === 'income' ? 'income' : 'expense'));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [who, setWho] = useState(initial?.user_id ?? userId);
  const [methodId, setMethodId] = useState<string | null>(initial?.payment_method_id ?? null);
  const [date, setDate] = useState(initial?.occurred_on ?? params.date ?? today());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);

  const categories = useCategories().data ?? EMPTY;
  const members = useMembers().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const history = useHistory(6).data ?? EMPTY;
  const save = useSaveTransaction();


  // Categorías ordenadas por uso (las más usadas primero)
  const kindCats = useMemo(() => {
    const usage = new Map<string, number>();
    for (const t of history) if (t.category_id) usage.set(t.category_id, (usage.get(t.category_id) ?? 0) + 1);
    return categories
      .filter((x) => x.kind === kind && !x.archived)
      .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [categories, kind, history]);

  const suggested = useMemo(() => suggestCategory(description, history, kind), [description, history, kind]);

  // Descripciones frecuentes para autocompletar
  const quickDescriptions = useMemo(() => {
    const counts = new Map<string, { n: number; category_id: string | null; amount: number }>();
    for (const t of history) {
      if (t.kind !== kind || !t.description) continue;
      const k = t.description.trim();
      const prev = counts.get(k);
      counts.set(k, { n: (prev?.n ?? 0) + 1, category_id: t.category_id, amount: t.amount });
    }
    const term = description.trim().toLowerCase();
    return [...counts.entries()]
      .filter(([d]) => !term || (d.toLowerCase().includes(term) && d.toLowerCase() !== term))
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 6);
  }, [history, kind, description]);

  async function addPhotos(source: 'camera' | 'library') {
    try {
      const imgs = await pickImages(source);
      setPhotos((p) => [...p, ...imgs].slice(0, 10));
    } catch (e) {
      Alert.alert('Fotos', (e as Error).message);
    }
  }

  async function onSave() {
    const value = parseAmount(amount);
    if (value <= 0) return Alert.alert('Monto', 'Escribe un monto mayor a 0');
    const cat = categoryId ?? suggested;
    if (kind === 'expense' && !cat) return Alert.alert('Categoría', 'Elige una categoría para el gasto');
    setSaving(true);
    try {
      const t = await save.mutateAsync({
        id: initial?.id,
        kind,
        amount: value,
        description: description.trim() || categories.find((x) => x.id === cat)?.name || '',
        category_id: cat,
        user_id: who,
        payment_method_id: methodId,
        occurred_on: date,
        notes: notes.trim() || null,
      });
      if (photos.length) await uploadEvidence(groupId, t.id, photos);
      await qc.invalidateQueries({ queryKey: ['attachments', t.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const accent = kind === 'income' ? c.income : c.expense;
  const visibleCats = showAllCats ? kindCats : kindCats.slice(0, 12);

  return (
    <Screen edges={[]}>
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategoryId(null);
        }}
        options={[
          { value: 'expense', label: 'Gasto', color: c.expense },
          { value: 'income', label: 'Ingreso', color: c.income },
        ]}
      />

      {/* Monto */}
      <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
        <T variant="label">Monto</T>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T style={{ fontSize: 40, fontWeight: '800', color: accent }}>$</T>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            placeholderTextColor={c.border}
            keyboardType="decimal-pad"
            autoFocus={!editing}
            style={{ fontSize: 48, fontWeight: '800', color: accent, minWidth: 80, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          />
        </View>
      </View>

      <Input
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        placeholder={kind === 'income' ? 'Semana 12, Aguinaldo…' : 'Super, gasolina, luz…'}
        returnKeyType="done"
      />
      {quickDescriptions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: -6, marginBottom: spacing.md }}>
          {quickDescriptions.map(([d, meta]) => (
            <Pressable
              key={d}
              onPress={() => {
                setDescription(d);
                if (meta.category_id) setCategoryId(meta.category_id);
                if (!amount) setAmount(String(meta.amount));
              }}
              style={{ backgroundColor: c.cardAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <T variant="small" style={{ color: c.text }}>{d}</T>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <T variant="label">Categoría</T>
        {suggested && !categoryId && (
          <T variant="small" color={c.primary}>✨ Sugerida: {categories.find((x) => x.id === suggested)?.name}</T>
        )}
      </View>
      <Card style={{ paddingHorizontal: spacing.sm }}>
        <CategoryGrid categories={visibleCats} value={categoryId} onChange={setCategoryId} suggested={suggested} />
        {kindCats.length > 12 && (
          <Pressable onPress={() => setShowAllCats(!showAllCats)} style={{ alignItems: 'center', paddingTop: 8 }}>
            <T color={c.primary} style={{ fontWeight: '600' }}>{showAllCats ? 'Ver menos' : `Ver todas (${kindCats.length})`}</T>
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/categories')} style={{ alignItems: 'center', paddingTop: 10 }}>
          <T color={c.primary} style={{ fontWeight: '600' }}>＋ Crear categoría nueva</T>
        </Pressable>
      </Card>

      {members.length > 1 && (
        <>
          <T variant="label" style={{ marginBottom: 6 }}>¿Quién?</T>
          <Card>
            <MemberPicker members={members} value={who} onChange={setWho} />
          </Card>
        </>
      )}

      <T variant="label" style={{ marginBottom: 6 }}>Forma de pago</T>
      <View style={{ marginBottom: spacing.md }}>
        <MethodPicker methods={methods} value={methodId} onChange={setMethodId} onAdd={() => router.push('/payment-methods')} />
      </View>

      <DateField label="Fecha" value={date} onChange={setDate} />

      <Input label="Notas (opcional)" value={notes} onChangeText={setNotes} placeholder="Detalles, folio, para qué fue…" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />

      <T variant="label" style={{ marginBottom: 6 }}>Evidencia (opcional)</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: spacing.md }}>
        {[
          { icon: 'camera' as const, label: 'Cámara', src: 'camera' as const },
          { icon: 'images' as const, label: 'Galería', src: 'library' as const },
        ].map((b) => (
          <Pressable
            key={b.src}
            onPress={() => addPhotos(b.src)}
            style={{
              width: 86,
              height: 86,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.border,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Ionicons name={b.icon} size={24} color={c.primary} />
            <T variant="small">{b.label}</T>
          </Pressable>
        ))}
        {photos.map((p, i) => (
          <View key={p.uri + i}>
            <Image source={{ uri: p.uri }} style={{ width: 86, height: 86, borderRadius: radius.md }} contentFit="cover" />
            <Pressable
              onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: -6, right: -6, backgroundColor: c.expense, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Button
        title={editing ? 'Guardar cambios' : kind === 'income' ? 'Registrar ingreso' : 'Registrar gasto'}
        variant={kind === 'income' ? 'success' : 'primary'}
        icon="checkmark"
        onPress={onSave}
        loading={saving}
      />
    </Screen>
  );
}
