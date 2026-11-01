import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { Card, EmptyState, IconCircle, Screen, T } from '@/components/ui';
import { useMarkAllRead, useNotifications } from '@/hooks/queries';
import { timeAgo } from '@/lib/dates';
import { useGroup } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { spacing, useColors } from '@/lib/theme';

const ICONS: Record<string, { icon: string; color: string }> = {
  income_missing: { icon: 'alarm', color: '#FFA928' },
  income_missing_group: { icon: 'people', color: '#FFA928' },
  income_added: { icon: 'cash', color: '#1DB173' },
  big_expense: { icon: 'trending-up', color: '#F0506E' },
  expense_added: { icon: 'receipt', color: '#2E90FA' },
  budget_warning: { icon: 'warning', color: '#FFA928' },
  budget_exceeded: { icon: 'alert-circle', color: '#F0506E' },
  bill_due: { icon: 'calendar', color: '#2E90FA' },
  bill_overdue: { icon: 'alarm', color: '#F0506E' },
  goal_completed: { icon: 'trophy', color: '#1DB173' },
  monthly_summary: { icon: 'stats-chart', color: '#6C5CE7' },
  member_joined: { icon: 'person-add', color: '#00C2A8' },
  bank_sync: { icon: 'business', color: '#00C2A8' },
};

export default function Notifications() {
  const c = useColors();
  const qc = useQueryClient();
  const { userId } = useGroup();
  const q = useNotifications();
  const markAll = useMarkAllRead();
  const items = q.data ?? [];

  // Al salir de la pantalla se marcan como leídas
  useEffect(() => () => {
    markAll.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: string, screen?: unknown) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['notifications', userId] });
    if (typeof screen === 'string') router.push(screen as never);
  }

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => markAll.mutate()} hitSlop={10}>
              <T color={c.primary} style={{ fontWeight: '600' }}>Marcar leídas</T>
            </Pressable>
          ),
        }}
      />
      {items.length === 0 && <EmptyState icon="notifications-off" title="Sin notificaciones" body="Aquí verás avisos del grupo, pagos y presupuestos." />}
      {items.map((n) => {
        const meta = ICONS[n.type] ?? { icon: 'notifications', color: c.primary };
        return (
          <Card key={n.id} onPress={() => open(n.id, n.data?.screen)} style={{ flexDirection: 'row', gap: spacing.md, opacity: n.read_at ? 0.65 : 1 }}>
            <IconCircle icon={meta.icon} color={meta.color} size={40} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T style={{ fontWeight: '700', flex: 1 }}>{n.title}</T>
                <T variant="small">{timeAgo(n.created_at)}</T>
              </View>
              <T variant="small" style={{ marginTop: 2 }}>{n.body}</T>
            </View>
            {!n.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 }} />}
          </Card>
        );
      })}
    </Screen>
  );
}
