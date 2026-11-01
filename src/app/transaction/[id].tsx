import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Dimensions, FlatList, Modal, Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Divider, IconCircle, Loading, Screen, T } from '@/components/ui';
import { useAttachments, useCategories, useDeleteTransaction, useMembers, usePaymentMethods, useSaveTransaction, useTransaction } from '@/hooks/queries';
import { prettyDate } from '@/lib/dates';
import { money } from '@/lib/format';
import { useGroup } from '@/lib/session';
import { radius, spacing, useColors } from '@/lib/theme';
import { deleteEvidence, pickImages, signedUrls, uploadEvidence } from '@/lib/upload';

export default function TransactionDetail() {
  const c = useColors();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groupId } = useGroup();
  const tq = useTransaction(id);
  const atts = useAttachments(id);
  const cats = useCategories().data ?? [];
  const members = useMembers().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const del = useDeleteTransaction();
  const save = useSaveTransaction();
  const [viewer, setViewer] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const urls = useQuery({
    queryKey: ['signed', id, (atts.data ?? []).map((a) => a.id).join(',')],
    enabled: !!atts.data?.length,
    staleTime: 50 * 60_000,
    queryFn: () => signedUrls((atts.data ?? []).map((a) => a.storage_path)),
  });

  const t = tq.data;
  if (!t) return <Loading />;
  const cat = cats.find((x) => x.id === t.category_id);
  const member = members.find((m) => m.user_id === t.user_id);
  const method = methods.find((m) => m.id === t.payment_method_id);
  const isIncome = t.kind === 'income';
  const photos = (atts.data ?? []).map((a) => ({ ...a, url: urls.data?.[a.storage_path] }));
  const W = Dimensions.get('window').width;

  async function addPhotos(src: 'camera' | 'library') {
    try {
      const imgs = await pickImages(src);
      if (!imgs.length) return;
      setUploading(true);
      await uploadEvidence(groupId, id, imgs);
      await qc.invalidateQueries({ queryKey: ['attachments', id] });
      await qc.invalidateQueries({ queryKey: ['transactions', groupId] });
    } catch (e) {
      Alert.alert('Fotos', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Eliminar movimiento', '¿Seguro? También se borran sus fotos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await del.mutateAsync(t!);
          router.back();
        },
      },
    ]);
  }

  function removePhoto(aid: string, path: string) {
    Alert.alert('Quitar foto', '¿Eliminar esta evidencia?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteEvidence(aid, path);
          setViewer(null);
          qc.invalidateQueries({ queryKey: ['attachments', id] });
          qc.invalidateQueries({ queryKey: ['transactions', groupId] });
        },
      },
    ]);
  }

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push(`/transaction/new?id=${t.id}`)} hitSlop={10}>
              <T color={c.primary} style={{ fontWeight: '700' }}>Editar</T>
            </Pressable>
          ),
        }}
      />
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <IconCircle icon={cat?.icon ?? (isIncome ? 'arrow-down' : 'pricetag')} color={cat?.color ?? c.primary} size={64} />
        <T variant="h1" color={isIncome ? c.income : c.text} style={{ marginTop: spacing.md }}>
          {isIncome ? '+' : '-'}
          {money(t.amount)}
        </T>
        <T variant="h3" style={{ marginTop: 4 }}>{t.description || cat?.name}</T>
        <T variant="muted">{prettyDate(t.occurred_on)} · {t.occurred_on}</T>
      </View>

      {t.needs_review && (
        <Card style={{ borderColor: c.warning, borderWidth: 1 }}>
          <T style={{ fontWeight: '700' }}>Importado del banco</T>
          <T variant="small" style={{ marginBottom: spacing.sm }}>Confirma la categoría y quién lo hizo.</T>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title="Editar" small variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/transaction/new?id=${t.id}`)} />
            <Button
              title="Está bien"
              small
              style={{ flex: 1 }}
              onPress={() => save.mutate({ ...t, needs_review: false })}
            />
          </View>
        </Card>
      )}

      <Card>
        {[
          { label: 'Tipo', value: isIncome ? 'Ingreso' : 'Gasto' },
          { label: 'Categoría', value: cat ? `${cat.name} · ${cat.type}` : '—' },
          { label: 'Forma de pago', value: method?.name ?? '—' },
          ...(t.bill_id ? [{ label: 'Pago recurrente', value: 'Sí' }] : []),
        ].map((r) => (
          <View key={r.label}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <T variant="muted">{r.label}</T>
              <T style={{ fontWeight: '600' }}>{r.value}</T>
            </View>
            <Divider />
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
          <T variant="muted">¿Quién?</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar user={member?.profiles} size={26} />
            <T style={{ fontWeight: '600' }}>{member?.profiles.full_name ?? '—'}</T>
          </View>
        </View>
        {t.notes ? (
          <>
            <Divider />
            <T variant="muted" style={{ marginTop: 10 }}>Notas</T>
            <T style={{ marginTop: 4 }}>{t.notes}</T>
          </>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <T variant="h3">Evidencias ({photos.length})</T>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Ionicons name="camera" size={24} color={c.primary} onPress={() => addPhotos('camera')} />
          <Ionicons name="images" size={24} color={c.primary} onPress={() => addPhotos('library')} />
        </View>
      </View>
      {uploading && <T variant="small">Subiendo fotos…</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg }}>
        {photos.map((p, i) => (
          <Pressable key={p.id} onPress={() => setViewer(i)}>
            <Image source={p.url ? { uri: p.url } : undefined} style={{ width: (W - 48) / 3, height: (W - 48) / 3, borderRadius: radius.md, backgroundColor: c.cardAlt }} contentFit="cover" transition={150} />
          </Pressable>
        ))}
        {!photos.length && <T variant="muted">Sin fotos. Agrega tickets, facturas o comprobantes.</T>}
      </View>

      <Button title="Eliminar movimiento" variant="danger" icon="trash" onPress={confirmDelete} loading={del.isPending} />

      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={viewer ?? 0}
            getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <View style={{ width: W, flex: 1, justifyContent: 'center' }}>
                <Image source={item.url ? { uri: item.url } : undefined} style={{ width: W, height: '80%' }} contentFit="contain" />
                <Pressable onPress={() => removePhoto(item.id, item.storage_path)} style={{ position: 'absolute', bottom: 60, alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Ionicons name="trash" size={20} color="#fff" />
                  <T color="#fff">Eliminar</T>
                </Pressable>
              </View>
            )}
          />
          <Pressable onPress={() => setViewer(null)} style={{ position: 'absolute', top: 60, right: 20 }} hitSlop={12}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </Screen>
  );
}
