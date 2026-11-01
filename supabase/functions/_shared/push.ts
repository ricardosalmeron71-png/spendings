import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  channelId?: string;
  priority?: 'high' | 'default';
};

/**
 * Envía las notificaciones pendientes (pushed_at is null) a Expo Push.
 * Funciona aunque la app esté cerrada: el sistema operativo las muestra.
 */
export async function flushPushQueue(db: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: pending, error } = await db
    .from('notifications')
    .select('id, user_id, title, body, data, type, group_id')
    .is('pushed_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(500);
  if (error) throw error;
  if (!pending?.length) return { sent: 0 };

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: tokens } = await db.from('push_tokens').select('token, user_id').in('user_id', userIds);
  const byUser = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
  }

  const messages: PushMessage[] = [];
  for (const n of pending) {
    for (const to of byUser.get(n.user_id) ?? []) {
      messages.push({
        to,
        title: n.title,
        body: n.body,
        sound: 'default',
        priority: 'high',
        channelId: n.type?.startsWith('bill') || n.type?.startsWith('income') ? 'reminders' : 'default',
        data: { ...(n.data ?? {}), notificationId: n.id, type: n.type, groupId: n.group_id },
      });
    }
  }

  const invalid: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
      },
      body: JSON.stringify(chunk),
    });
    const out = await res.json().catch(() => ({}));
    (out?.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, idx: number) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') invalid.push(chunk[idx].to);
    });
  }

  if (invalid.length) await db.from('push_tokens').delete().in('token', invalid);
  await db.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', pending.map((n) => n.id));
  return { sent: messages.length, notifications: pending.length };
}
