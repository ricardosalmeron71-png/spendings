import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { Button, Card, Chip, Screen, SwitchRow, T } from '@/components/ui';
import { useBills } from '@/hooks/queries';
import { WEEKDAYS } from '@/lib/dates';
import { DEFAULT_SETTINGS, getReminderSettings, requestPermission, saveReminderSettings, syncLocalReminders, type ReminderSettings } from '@/lib/notifications';
import { useGroup } from '@/lib/session';
import { spacing } from '@/lib/theme';

export default function Reminders() {
  const { group } = useGroup();
  const bills = useBills().data ?? [];
  const [s, setS] = useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [scheduled, setScheduled] = useState(0);

  useEffect(() => {
    getReminderSettings().then(setS);
    Notifications.getPermissionsAsync().then((p) => setGranted(p.granted));
    Notifications.getAllScheduledNotificationsAsync().then((l) => setScheduled(l.length));
  }, []);

  async function update(patch: Partial<ReminderSettings>) {
    const next = { ...s, ...patch };
    setS(next);
    await saveReminderSettings(next);
    const n = await syncLocalReminders(bills, next);
    setScheduled(n ?? 0);
  }

  async function test() {
    const ok = await requestPermission();
    setGranted(ok);
    if (!ok) return Alert.alert('Permiso denegado', 'Actívalo en Ajustes del teléfono.', [{ text: 'Abrir ajustes', onPress: () => Linking.openSettings() }, { text: 'OK' }]);
    await Notifications.scheduleNotificationAsync({
      content: { title: '🔔 Prueba de recordatorio', body: 'Así te llegarán los avisos, incluso con la app cerrada.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
    });
    Alert.alert('Programada', 'Cierra la app: en 5 segundos llegará la notificación.');
  }

  return (
    <Screen edges={[]}>
      {granted === false && (
        <Card>
          <T style={{ fontWeight: '700' }}>Las notificaciones están desactivadas</T>
          <T variant="small" style={{ marginVertical: 6 }}>Sin permiso no podremos avisarte de pagos ni del registro semanal.</T>
          <Button title="Activar" small onPress={test} />
        </Card>
      )}
      <Card style={{ paddingVertical: 0 }}>
        <SwitchRow title="Pagos por vencer" subtitle="Aviso X días antes (configurable en cada pago) y el día límite, 9:00 am" value={s.billReminders} onChange={(v) => update({ billReminders: v })} />
        <SwitchRow title="Registro semanal de ingresos" subtitle="Recordatorio a las 10:00 am" value={s.weeklyIncome} onChange={(v) => update({ weeklyIncome: v })} />
        {s.weeklyIncome && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: spacing.md }}>
            {WEEKDAYS.map((d, i) => <Chip key={d} label={d.slice(0, 3)} selected={s.weeklyIncomeWeekday === i} onPress={() => update({ weeklyIncomeWeekday: i })} />)}
          </View>
        )}
        <SwitchRow title="Recordatorio diario de gastos" subtitle="Para no olvidar anotar lo del día" value={s.dailyLog} onChange={(v) => update({ dailyLog: v })} />
        {s.dailyLog && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: spacing.md }}>
            {[19, 20, 21, 22].map((h) => <Chip key={h} label={`${h}:00`} selected={s.dailyLogHour === h} onPress={() => update({ dailyLogHour: h })} />)}
          </View>
        )}
      </Card>
      <T variant="small" style={{ marginBottom: spacing.md }}>
        {scheduled} recordatorio(s) programados en este teléfono. El grupo revisa el registro de ingresos cada {WEEKDAYS[group.income_check_weekday].toLowerCase()} y, si falta alguien, el servidor envía push a todos.
      </T>
      <Button title="Enviar notificación de prueba" icon="notifications" variant="secondary" onPress={test} />
    </Screen>
  );
}
