import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { MethodPicker } from '@/components/Pickers';
import { Button, Card, Divider, IconCircle, Screen, SectionHeader, T } from '@/components/ui';
import { useBankConnections, useMembers, usePaymentMethods } from '@/hooks/queries';
import { timeAgo } from '@/lib/dates';
import { useGroup } from '@/lib/session';
import { invokeFunction } from '@/lib/supabase';
import { spacing, useColors } from '@/lib/theme';

export default function Bank() {
  const c = useColors();
  const qc = useQueryClient();
  const { groupId, userId } = useGroup();
  const conns = useBankConnections().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const members = useMembers().data ?? [];
  const [methodId, setMethodId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bank', groupId] });
    qc.invalidateQueries({ queryKey: ['transactions', groupId] });
  };

  async function connect() {
    if (Platform.OS === 'web') {
      return Alert.alert('Solo en la app', 'La conexión bancaria está disponible en la app instalada de Android.');
    }
    setBusy('connect');
    try {
      const { widgetUrl, scheme } = await invokeFunction<{ widgetUrl: string; scheme: string }>('fin-belvo', { action: 'widget_token' });
      const res = await WebBrowser.openAuthSessionAsync(widgetUrl, `${scheme}://`);
      if (res.type !== 'success') return;
      const parsed = Linking.parse(res.url);
      if (parsed.hostname === 'exit') return;
      if (parsed.hostname === 'error') {
        return Alert.alert('Conexión bancaria', String(parsed.queryParams?.error_message ?? 'El banco no pudo conectarse. Intenta de nuevo.'));
      }
      const link = parsed.queryParams?.link;
      const institution = parsed.queryParams?.institution;
      if (typeof link !== 'string') return Alert.alert('Conexión cancelada');
      const out = await invokeFunction<{ imported: number }>('fin-belvo', {
        action: 'register',
        group_id: groupId,
        link_id: link,
        institution: typeof institution === 'string' ? institution : null,
        payment_method_id: methodId,
      });
      Alert.alert('¡Banco conectado! 🏦', `Importamos ${out.imported} movimientos para revisión.`);
      refresh();
    } catch (e) {
      Alert.alert('Conexión bancaria', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sync(id: string) {
    setBusy(id);
    try {
      const out = await invokeFunction<{ imported: number }>('fin-belvo', { action: 'sync', connection_id: id });
      Alert.alert('Sincronizado', `${out.imported} movimientos nuevos`);
      refresh();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    Alert.alert('Desconectar banco', 'Los movimientos ya importados se conservan.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          try {
            await invokeFunction('fin-belvo', { action: 'delete', connection_id: id });
            refresh();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <Screen edges={[]}>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <IconCircle icon="shield-checkmark" color={c.income} size={44} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>Conexión segura con Belvo</T>
            <T variant="small">
              Open finance regulado en México (BBVA, Banorte, Santander, HSBC, Banamex, Amex y más). Solo lectura: nadie puede mover tu dinero. Tus claves nunca pasan por esta app.
            </T>
          </View>
        </View>
      </Card>

      <SectionHeader title="Cuentas conectadas" />
      <Card style={{ paddingVertical: 4 }}>
        {conns.length === 0 && <T variant="muted" style={{ paddingVertical: spacing.md }}>Aún no conectas ningún banco.</T>}
        {conns.map((cn, i) => {
          const owner = members.find((m) => m.user_id === cn.user_id);
          return (
            <View key={cn.id}>
              {i > 0 && <Divider />}
              <View style={{ paddingVertical: spacing.md, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <IconCircle icon="business" color={cn.status === 'active' ? c.accent : c.expense} size={40} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: '700' }}>{cn.institution ?? 'Banco'}</T>
                    <T variant="small">
                      {owner?.profiles.full_name ?? ''} · {cn.status === 'active' ? 'Activa' : 'Requiere reconexión'}
                      {cn.last_sync_at ? ` · sincronizado ${timeAgo(cn.last_sync_at)}` : ''}
                    </T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button title="Sincronizar" small variant="secondary" style={{ flex: 1 }} onPress={() => sync(cn.id)} loading={busy === cn.id} />
                  {cn.user_id === userId && <Button title="Quitar" small variant="ghost" onPress={() => remove(cn.id)} />}
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      <SectionHeader title="Conectar nuevo banco" />
      <Card>
        <T variant="small" style={{ marginBottom: spacing.sm }}>¿A qué forma de pago asignamos los movimientos? (opcional)</T>
        <MethodPicker methods={methods} value={methodId} onChange={setMethodId} />
        <Button title="Conectar banco" icon="link" onPress={connect} loading={busy === 'connect'} style={{ marginTop: spacing.md }} />
      </Card>
      <T variant="small" center>
        Los movimientos importados llegan marcados «por revisar» y se categorizan solos según tu historial. Se sincronizan cada 6 horas.
      </T>
    </Screen>
  );
}
