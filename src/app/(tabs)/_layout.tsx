import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useBills, useGroupRealtime } from '@/hooks/queries';
import { syncLocalReminders } from '@/lib/notifications';
import { useColors } from '@/lib/theme';

function AddButton() {
  const c = useColors();
  return (
    <LinearGradient
      colors={c.gradient}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -18,
        shadowColor: c.primary,
        shadowOpacity: 0.45,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      <Ionicons name="add" size={32} color="#fff" />
    </LinearGradient>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const bills = useBills();
  useGroupRealtime();

  // Mantiene sincronizados los recordatorios locales (funcionan con la app cerrada)
  useEffect(() => {
    if (bills.data) syncLocalReminders(bills.data).catch(() => {});
  }, [bills.data]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopColor: c.border, height: 88, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color as string} /> }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Movimientos', tabBarIcon: ({ color, size }) => <Ionicons name="swap-vertical" size={size} color={color as string} /> }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: '', tabBarIcon: () => <View><AddButton /></View> }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push('/transaction/new');
          },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendario', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color as string} /> }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: 'Asistente', tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color as string} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ href: null }}
      />
    </Tabs>
  );
}
