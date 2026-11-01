import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Integración opcional con Belvo (open finance en México: BBVA, Banorte, HSBC,
 * Santander, Banamex, Amex, etc.).
 * Variables: BELVO_SECRET_ID, BELVO_SECRET_PASSWORD, BELVO_ENV (sandbox | production)
 */
export function belvoBase() {
  return Deno.env.get('BELVO_ENV') === 'production' ? 'https://api.belvo.com' : 'https://sandbox.belvo.com';
}

export function belvoConfigured() {
  return Boolean(Deno.env.get('BELVO_SECRET_ID') && Deno.env.get('BELVO_SECRET_PASSWORD'));
}

function authHeader() {
  return 'Basic ' + btoa(`${Deno.env.get('BELVO_SECRET_ID')}:${Deno.env.get('BELVO_SECRET_PASSWORD')}`);
}

export async function belvoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(belvoBase() + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Belvo ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/** Token de acceso para el widget de conexión (lo genera el servidor, nunca la app). */
export async function widgetToken() {
  return belvoFetch('/api/token/', {
    method: 'POST',
    body: JSON.stringify({
      id: Deno.env.get('BELVO_SECRET_ID'),
      password: Deno.env.get('BELVO_SECRET_PASSWORD'),
      scopes: 'read_institutions,write_links,read_links',
    }),
  }) as Promise<{ access: string; refresh: string }>;
}

type BelvoTxn = {
  id: string;
  amount: number;
  type: 'INFLOW' | 'OUTFLOW';
  description: string | null;
  merchant?: { name?: string } | null;
  value_date: string;
  category?: string | null;
};

/** Descarga movimientos de un link y los inserta (sin duplicar) para revisión. */
export async function syncConnection(db: SupabaseClient, conn: {
  id: string; group_id: string; user_id: string; link_id: string; payment_method_id: string | null; last_sync_at: string | null;
}) {
  const to = new Date().toISOString().slice(0, 10);
  const from = conn.last_sync_at
    ? new Date(new Date(conn.last_sync_at).getTime() - 3 * 86400000).toISOString().slice(0, 10)
    : new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const txns: BelvoTxn[] = await belvoFetch('/api/transactions/', {
    method: 'POST',
    body: JSON.stringify({ link: conn.link_id, date_from: from, date_to: to, save_data: true }),
  });

  // Regla simple de auto-categorización: usar la última categoría que el grupo usó con la misma descripción
  const { data: history } = await db
    .from('transactions')
    .select('description, category_id, kind')
    .eq('group_id', conn.group_id)
    .not('category_id', 'is', null)
    .order('occurred_on', { ascending: false })
    .limit(1000);
  const learned = new Map<string, string>();
  for (const h of history ?? []) {
    const key = `${h.kind}:${(h.description ?? '').toLowerCase().trim()}`;
    if (!learned.has(key)) learned.set(key, h.category_id);
  }

  const rows = (txns ?? []).map((t) => {
    const kind = t.type === 'INFLOW' ? 'income' : 'expense';
    const description = (t.merchant?.name || t.description || 'Movimiento bancario').slice(0, 120);
    return {
      group_id: conn.group_id,
      user_id: conn.user_id,
      kind,
      amount: Math.abs(Number(t.amount)),
      description,
      occurred_on: t.value_date?.slice(0, 10) ?? to,
      payment_method_id: conn.payment_method_id,
      category_id: learned.get(`${kind}:${description.toLowerCase().trim()}`) ?? null,
      bank_txn_id: t.id,
      needs_review: true,
      created_by: conn.user_id,
    };
  }).filter((r) => r.amount > 0);

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await db
      .from('transactions')
      .upsert(rows, { onConflict: 'group_id,bank_txn_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted = data?.length ?? 0;
  }
  await db.from('bank_connections').update({ last_sync_at: new Date().toISOString(), status: 'active' }).eq('id', conn.id);
  if (inserted > 0) {
    await db.from('notifications').insert({
      user_id: conn.user_id,
      group_id: conn.group_id,
      type: 'bank_sync',
      title: '🏦 Movimientos importados',
      body: `${inserted} movimiento(s) nuevos del banco esperan tu revisión`,
    });
  }
  return inserted;
}
