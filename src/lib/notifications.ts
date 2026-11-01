import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, addMonths, daysBetween, fromISODate, today } from './dates';
import { money } from './format';
import { supabase } from './supabase';
import type { Bill } from './types';

/**
 * Dos mecanismos para que lleguen avisos con la app cerrada:
 *  1) Notificaciones LOCALES programadas en el teléfono (pagos, jueves de ingresos, recordatorio diario).
 *     Las agenda el sistema operativo; funcionan sin internet y con la app cerrada.
 *  2) Notificaciones PUSH desde Supabase (pg_cron → Edge Function `scheduler` → Expo Push):
 *     avisos del grupo (quién no registró ingresos, gastos grandes, presupuestos, etc.).
 */

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

const SETTINGS_KEY = 'notification-settings-v1';
const TOKEN_KEY = 'expo-push-token';
const LOCAL_PREFIX = 'local-';

export interface ReminderSettings {
  billReminders: boolean;
  weeklyIncome: boolean;
  weeklyIncomeWeekday: number; // 0 = domingo … 4 = jueves
  dailyLog: boolean;
  dailyLogHour: number;
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  billReminders: true,
  weeklyIncome: true,
  weeklyIncomeWeekday: 4,
  dailyLog: true,
  dailyLogHour: 21,
};

export async function getReminderSettings(): Promise<ReminderSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveReminderSettings(s: ReminderSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Recordatorios de pagos e ingresos',
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6C5CE7',
  });
}

export async function requestPermission(): Promise<boolean> {
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const res = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return res.granted;
}

/** Registra el token de Expo Push del dispositivo en Supabase. */
export async function registerPushToken(userId: string) {
  if (!Device.isDevice || Platform.OS === 'web') return null;
  const ok = await requestPermission();
  if (!ok) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || String(projectId).startsWith('REEMPLAZA')) {
    console.warn('Falta extra.eas.projectId en app.json: las push remotas no funcionarán (las locales sí).');
    return null;
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert({
      token,
      user_id: userId,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.warn('No se pudo obtener el token push', e);
    return null;
  }
}

export async function unregisterPushToken() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
  await cancelLocalReminders();
}

async function cancelLocalReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(LOCAL_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

function nextOccurrences(bill: Bill, horizonDays: number) {
  const out: string[] = [];
  let d = bill.next_due_date;
  const limit = addDays(today(), horizonDays);
  for (let i = 0; i < 6 && d <= limit; i++) {
    out.push(d);
    if (bill.frequency === 'once') break;
    const step: Record<string, (x: string) => string> = {
      weekly: (x) => addDays(x, 7),
      biweekly: (x) => addDays(x, 14),
      monthly: (x) => shiftMonths(x, 1),
      bimonthly: (x) => shiftMonths(x, 2),
      quarterly: (x) => shiftMonths(x, 3),
      yearly: (x) => shiftMonths(x, 12),
    };
    d = step[bill.frequency](d);
  }
  return out;
}

const shiftMonths = addMonths;

function at(iso: string, hour: number, minute = 0) {
  const d = fromISODate(iso);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Re-programa todos los recordatorios locales. Se llama al abrir la app y cada vez que
 * cambian los pagos. iOS permite ~64 pendientes, por eso se limita a 55.
 */
export async function syncLocalReminders(bills: Bill[], settingsOverride?: ReminderSettings) {
  if (Platform.OS === 'web') return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  const settings = settingsOverride ?? (await getReminderSettings());
  await cancelLocalReminders();

  const jobs: Notifications.NotificationRequestInput[] = [];
  const now = Date.now();

  if (settings.weeklyIncome) {
    jobs.push({
      identifier: `${LOCAL_PREFIX}weekly-income`,
      content: {
        title: '📝 Registro semanal de ingresos',
        body: 'Hoy toca registrar lo que recibiste esta semana. ¡Toma 10 segundos!',
        data: { screen: '/transaction/new?kind=income' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: settings.weeklyIncomeWeekday + 1, // expo: 1 = domingo
        hour: 10,
        minute: 0,
        channelId: 'reminders',
      },
    });
  }

  if (settings.dailyLog) {
    jobs.push({
      identifier: `${LOCAL_PREFIX}daily-log`,
      content: {
        title: '💸 ¿Registraste tus gastos de hoy?',
        body: 'Anotar al momento evita los gastos hormiga invisibles.',
        data: { screen: '/transaction/new' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.dailyLogHour,
        minute: 0,
        channelId: 'default',
      },
    });
  }

  if (settings.billReminders) {
    const billJobs: Notifications.NotificationRequestInput[] = [];
    for (const bill of bills.filter((b) => b.active)) {
      for (const due of nextOccurrences(bill, 62)) {
        const remaining = due === bill.next_due_date ? bill.amount - bill.period_paid : bill.amount;
        if (remaining <= 0) continue;
        const before = addDays(due, -bill.remind_days_before);
        if (bill.remind_days_before > 0 && at(before, 9).getTime() > now) {
          billJobs.push({
            identifier: `${LOCAL_PREFIX}bill-${bill.id}-${due}-pre`,
            content: {
              title: `📅 ${bill.name} vence en ${bill.remind_days_before} día${bill.remind_days_before === 1 ? '' : 's'}`,
              body: `${money(remaining)}${bill.autopay ? ' · cargo automático' : ''}`,
              data: { screen: `/bills/${bill.id}` },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at(before, 9), channelId: 'reminders' },
          });
        }
        if (at(due, 9).getTime() > now) {
          billJobs.push({
            identifier: `${LOCAL_PREFIX}bill-${bill.id}-${due}-due`,
            content: {
              title: `🔔 Hoy vence ${bill.name}`,
              body: `Paga ${money(remaining)} para evitar recargos.`,
              data: { screen: `/bills/${bill.id}` },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at(due, 9), channelId: 'reminders' },
          });
        }
      }
    }
    billJobs.sort((a, b) => {
      const da = (a.trigger as { date: Date }).date.getTime();
      const db = (b.trigger as { date: Date }).date.getTime();
      return da - db;
    });
    jobs.push(...billJobs.slice(0, 55 - jobs.length));
  }

  for (const job of jobs) {
    try {
      await Notifications.scheduleNotificationAsync(job);
    } catch (e) {
      console.warn('No se pudo programar', job.identifier, e);
    }
  }
  return jobs.length;
}

export function daysUntil(iso: string) {
  return daysBetween(today(), iso);
}
