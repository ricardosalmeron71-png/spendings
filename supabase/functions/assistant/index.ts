// Edge Function: assistant — asesor financiero con IA (Claude).
//   POST { group_id, message }  → { reply }
// Secret requerido: ANTHROPIC_API_KEY
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { adminClient, corsHeaders, handleError, HttpError, json, requireMember, requireUser } from '../_shared/admin.ts';
import { addDays, localParts, weekStart } from '../_shared/dates.ts';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const MODEL = Deno.env.get('ASSISTANT_MODEL') ?? 'claude-opus-5-5';

// Prompt estable (se cachea). No meter aquí nada que cambie por petición.
const SYSTEM_PROMPT = `Eres "Fin", el asistente financiero de una app de control de gastos para familias y grupos en México.
Hablas en español mexicano, cálido, directo y práctico. Moneda por defecto: pesos mexicanos (MXN).

Tu trabajo:
- Ayudar a controlar gastos, entender en qué se va el dinero y detectar fugas (suscripciones, gastos hormiga, comisiones, intereses de tarjetas).
- Dar consejos concretos para optimizar ingresos y ahorrar: regla 50/30/20, fondo de emergencia (3–6 meses de gastos esenciales), pagar tarjetas antes de la fecha límite para no generar intereses, aprovechar meses sin intereses sólo si ya está presupuestado, Afore/aportaciones voluntarias, CETES/instrumentos de bajo riesgo como opción general.
- Recordar pagos próximos y registros pendientes del grupo.
- Proponer presupuestos por categoría basados en el historial real.

Reglas:
- Basa tus respuestas en el "Resumen financiero" que recibes. Si un dato no está ahí, dilo; no inventes cifras.
- Cita montos con formato $1,234 y compara contra meses anteriores cuando sea útil.
- Sé breve: máximo ~180 palabras salvo que pidan detalle. Usa viñetas cortas y termina con 1–3 acciones concretas.
- No eres asesor de inversiones regulado: para decisiones grandes (créditos, inversiones de riesgo) sugiere consultar a un profesional.
- No pidas ni guardes contraseñas, NIP o datos de tarjetas.`;

type Txn = { kind: string; amount: number; occurred_on: string; description: string; user_id: string; category_id: string | null; payment_method_id: string | null };

async function buildSnapshot(groupId: string, userId: string) {
  const db = adminClient();
  const { data: group } = await db.from('groups').select('name, currency, timezone, income_check_weekday').eq('id', groupId).single();
  const today = localParts(group?.timezone ?? 'America/Mexico_City').date;
  const [y, mo] = today.split('-').map(Number);
  const from = new Date(Date.UTC(y, mo - 1 - 3, 1)).toISOString().slice(0, 10); // 3 meses atrás + mes actual

  const [{ data: txns }, { data: cats }, { data: members }, { data: budgets }, { data: bills }, { data: goals }, { data: methods }] = await Promise.all([
    db.from('transactions').select('kind, amount, occurred_on, description, user_id, category_id, payment_method_id')
      .eq('group_id', groupId).gte('occurred_on', from).order('occurred_on', { ascending: false }).limit(3000),
    db.from('categories').select('id, name, type, is_essential').eq('group_id', groupId),
    db.from('group_members').select('user_id, role, profiles(full_name)').eq('group_id', groupId),
    db.from('budgets').select('category_id, amount').eq('group_id', groupId),
    db.from('bills').select('name, amount, period_paid, next_due_date, frequency').eq('group_id', groupId).eq('active', true).order('next_due_date').limit(30),
    db.from('savings_goals').select('name, target_amount, current_amount, target_date').eq('group_id', groupId),
    db.from('payment_methods').select('id, name, kind, credit_limit, cut_day, due_day').eq('group_id', groupId),
  ]);

  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  // deno-lint-ignore no-explicit-any
  const memberName = new Map((members ?? []).map((m: any) => [m.user_id, m.profiles?.full_name ?? 'Miembro']));
  const pmName = new Map((methods ?? []).map((p) => [p.id, p.name]));

  const byMonth: Record<string, { income: number; expense: number; cats: Record<string, number> }> = {};
  for (const t of (txns ?? []) as Txn[]) {
    const m = t.occurred_on.slice(0, 7);
    byMonth[m] ??= { income: 0, expense: 0, cats: {} };
    if (t.kind === 'income') byMonth[m].income += Number(t.amount);
    if (t.kind === 'expense') {
      byMonth[m].expense += Number(t.amount);
      const c = catName.get(t.category_id ?? '') ?? 'Sin categoría';
      byMonth[m].cats[c] = (byMonth[m].cats[c] ?? 0) + Number(t.amount);
    }
  }
  const months = Object.keys(byMonth).sort().reverse().map((m) => ({
    mes: m,
    ingresos: Math.round(byMonth[m].income),
    gastos: Math.round(byMonth[m].expense),
    top_categorias: Object.entries(byMonth[m].cats).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([k, v]) => `${k}: $${Math.round(v)}`),
  }));

  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const weekIncome = new Set((txns ?? []).filter((t) => t.kind === 'income' && t.occurred_on >= ws && t.occurred_on <= we).map((t) => t.user_id));

  const recent = ((txns ?? []) as Txn[]).slice(0, 40).map((t) =>
    `${t.occurred_on} | ${t.kind === 'income' ? '+' : '-'}$${Number(t.amount)} | ${t.description} | ${catName.get(t.category_id ?? '') ?? ''} | ${memberName.get(t.user_id)} | ${pmName.get(t.payment_method_id ?? '') ?? ''}`);

  return {
    fecha_hoy: today,
    grupo: group?.name,
    usuario_que_pregunta: memberName.get(userId),
    miembros: (members ?? []).map((m) => ({
      nombre: memberName.get(m.user_id),
      registro_ingresos_esta_semana: weekIncome.has(m.user_id) ? 'sí' : 'pendiente',
    })),
    meses: months,
    presupuestos: (budgets ?? []).map((b) => ({ categoria: b.category_id ? catName.get(b.category_id) : 'TOTAL', monto: b.amount })),
    pagos_proximos: (bills ?? []).map((b) => ({ nombre: b.name, monto: b.amount, abonado: b.period_paid, vence: b.next_due_date, frecuencia: b.frequency })),
    metas_ahorro: goals ?? [],
    formas_de_pago: (methods ?? []).map((p) => ({ nombre: p.name, tipo: p.kind, limite: p.credit_limit, dia_corte: p.cut_day, dia_pago: p.due_day })),
    movimientos_recientes: recent,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user, client } = await requireUser(req);
    const { group_id, message } = await req.json();
    if (!group_id || typeof message !== 'string' || !message.trim()) throw new HttpError(400, 'Falta el mensaje');
    if (message.length > 4000) throw new HttpError(400, 'Mensaje demasiado largo');
    await requireMember(client, group_id);

    const db = adminClient();
    const { data: history } = await db
      .from('assistant_messages')
      .select('role, content')
      .eq('group_id', group_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const snapshot = await buildSnapshot(group_id, user.id);
    const messages: Anthropic.MessageParam[] = [
      ...(history ?? []).reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: `<resumen_financiero>\n${JSON.stringify(snapshot)}\n</resumen_financiero>\n\n${message.trim()}` },
    ];
    // La API exige que el primer mensaje sea del usuario
    while (messages.length && messages[0].role !== 'user') messages.shift();

    // Fallback del lado del servidor: si el modelo declina por política, la API reintenta con el modelo recomendado.
    // deno-lint-ignore no-explicit-any
    const response: any = await (anthropic.beta.messages.create as any)({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    let reply = '';
    if (response.stop_reason === 'refusal') {
      reply = 'No puedo ayudar con eso, pero con gusto te apoyo con tus finanzas del grupo. 🙂';
    } else {
      reply = (response.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('\n')
        .trim() || 'No tengo una respuesta ahora, intenta de nuevo.';
    }

    await db.from('assistant_messages').insert([
      { group_id, user_id: user.id, role: 'user', content: message.trim() },
      { group_id, user_id: user.id, role: 'assistant', content: reply },
    ]);
    return json({ reply });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'El asistente está ocupado, intenta en un minuto.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Falta configurar ANTHROPIC_API_KEY en Supabase.' }, 500);
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic', e.status, e.message);
      return json({ error: 'El asistente no está disponible por ahora.' }, 502);
    }
    return handleError(e);
  }
});
