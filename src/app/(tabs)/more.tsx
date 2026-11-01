import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Card, Divider, ListItem, Screen, T } from '@/components/ui';
import { useNotifications } from '@/hooks/queries';
import { useGroup, useSession } from '@/lib/session';
import { spacing, useColors } from '@/lib/theme';

export default function More() {
  const c = useColors();
  const { profile, groups, signOut } = useSession();
  const { group } = useGroup();
  const unread = (useNotifications().data ?? []).filter((n) => !n.read_at).length;

  const sections: { title: string; items: { icon: string; color: string; title: string; subtitle?: string; href: string }[] }[] = [
    {
      title: 'Control',
      items: [
        { icon: 'stats-chart', color: c.primary, title: 'Métricas', subtitle: 'Tendencias, categorías, miembros', href: '/metrics' },
        { icon: 'pie-chart', color: '#E056FD', title: 'Presupuestos', subtitle: 'Límites por categoría con alertas', href: '/budgets' },
        { icon: 'map', color: c.accent, title: 'Plan de gastos', subtitle: 'Ingreso esperado y regla 50/30/20', href: '/plan' },
        { icon: 'flag', color: c.income, title: 'Metas de ahorro', href: '/goals' },
        { icon: 'repeat', color: c.info, title: 'Pagos recurrentes', subtitle: 'Luz, internet, tarjetas, renta…', href: '/bills' },
      ],
    },
    {
      title: 'Configuración',
      items: [
        { icon: 'pricetags', color: c.warning, title: 'Categorías', href: '/categories' },
        { icon: 'card', color: '#2D3436', title: 'Formas de pago', subtitle: 'Tarjetas, nómina, efectivo', href: '/payment-methods' },
        { icon: 'business', color: c.accent, title: 'Conexión bancaria', subtitle: 'Importa movimientos automáticamente', href: '/bank' },
        { icon: 'alarm', color: c.expense, title: 'Recordatorios', subtitle: 'Avisos con la app cerrada', href: '/reminders' },
        { icon: 'notifications', color: c.primary, title: `Notificaciones${unread ? ` (${unread})` : ''}`, href: '/notifications' },
      ],
    },
    {
      title: 'Grupo',
      items: [
        { icon: 'people', color: c.primary, title: `${group.emoji} ${group.name}`, subtitle: 'Miembros, invitar, roles', href: '/group' },
        { icon: 'add-circle', color: c.income, title: 'Crear o unirme a otro grupo', href: '/join' },
      ],
    },
  ];

  return (
    <Screen>
      <Pressable onPress={() => router.push('/profile')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Avatar user={profile} size={64} />
          <View style={{ flex: 1 }}>
            <T variant="h2">{profile?.full_name}</T>
            <T variant="muted">Editar perfil y avatar</T>
          </View>
        </Card>
      </Pressable>

      {groups.length > 1 && <GroupSwitcher />}

      {sections.map((s) => (
        <View key={s.title}>
          <T variant="label" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>{s.title}</T>
          <Card style={{ paddingVertical: 4 }}>
            {s.items.map((it, i) => (
              <View key={it.href}>
                {i > 0 && <Divider />}
                <ListItem icon={it.icon} iconColor={it.color} title={it.title} subtitle={it.subtitle} onPress={() => router.push(it.href as never)} />
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Card>
        <ListItem
          icon="log-out"
          iconColor={c.expense}
          title="Cerrar sesión"
          chevron={false}
          onPress={() =>
            Alert.alert('Cerrar sesión', '¿Seguro?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Salir', style: 'destructive', onPress: signOut },
            ])
          }
        />
      </Card>
    </Screen>
  );
}

function GroupSwitcher() {
  const c = useColors();
  const { groups, group, setActiveGroup } = useSession();
  return (
    <>
      <T variant="label" style={{ marginBottom: spacing.sm }}>Mis grupos</T>
      <Card style={{ paddingVertical: 4 }}>
        {groups.map((g, i) => (
          <View key={g.id}>
            {i > 0 && <Divider />}
            <ListItem
              icon={g.id === group?.id ? 'checkmark-circle' : 'ellipse-outline'}
              iconColor={g.id === group?.id ? c.income : c.textMuted}
              title={`${g.emoji} ${g.name}`}
              chevron={false}
              onPress={() => setActiveGroup(g.id)}
            />
          </View>
        ))}
      </Card>
    </>
  );
}
