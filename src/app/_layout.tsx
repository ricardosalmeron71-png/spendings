import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SetupRequired } from '@/components/SetupRequired';
import { Loading } from '@/components/ui';
import { ensureChannels, registerPushToken } from '@/lib/notifications';
import { SessionProvider, useSession } from '@/lib/session';
import { isSupabaseConfigured } from '@/lib/supabase';
import { darkColors, lightColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function useNotificationNavigation() {
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      const screen = data?.screen;
      if (typeof screen === 'string') setTimeout(() => router.push(screen as never), 300);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}

function RootNavigator() {
  const { session, loading, groups } = useSession();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? darkColors : lightColors;
  useNotificationNavigation();

  useEffect(() => {
    ensureChannels().catch(() => {});
  }, []);
  useEffect(() => {
    if (session?.user.id) registerPushToken(session.user.id).catch(() => {});
  }, [session?.user.id]);
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) return <Loading />;
  const authed = !!session;
  const hasGroup = groups.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '700' },
          headerBackTitle: 'Atrás',
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Protected guard={!authed}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={authed && !hasGroup}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={authed && hasGroup}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transaction/new" options={{ presentation: 'modal', title: 'Nuevo movimiento' }} />
          <Stack.Screen name="transaction/[id]" options={{ title: 'Detalle' }} />
          <Stack.Screen name="bills/index" options={{ title: 'Pagos recurrentes' }} />
          <Stack.Screen name="bills/[id]" options={{ presentation: 'modal', title: 'Pago recurrente' }} />
          <Stack.Screen name="budgets" options={{ title: 'Presupuestos' }} />
          <Stack.Screen name="plan" options={{ title: 'Plan de gastos' }} />
          <Stack.Screen name="goals" options={{ title: 'Metas de ahorro' }} />
          <Stack.Screen name="metrics" options={{ title: 'Métricas' }} />
          <Stack.Screen name="categories" options={{ title: 'Categorías' }} />
          <Stack.Screen name="payment-methods" options={{ title: 'Formas de pago' }} />
          <Stack.Screen name="group" options={{ title: 'Mi grupo' }} />
          <Stack.Screen name="profile" options={{ title: 'Perfil y avatar' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notificaciones' }} />
          <Stack.Screen name="reminders" options={{ title: 'Recordatorios' }} />
          <Stack.Screen name="bank" options={{ title: 'Conexión bancaria' }} />
          <Stack.Screen name="join" options={{ presentation: 'modal', title: 'Unirse / crear grupo' }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <RootNavigator />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
