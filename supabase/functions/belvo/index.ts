// Edge Function: belvo
//  POST { action: 'widget_token' }                         → { access, widgetUrl }
//  POST { action: 'register', group_id, link_id, institution, payment_method_id? }
//  POST { action: 'sync', connection_id }
//  POST { action: 'delete', connection_id }
import { adminClient, corsHeaders, handleError, HttpError, json, requireMember, requireUser } from '../_shared/admin.ts';
import { belvoConfigured, belvoFetch, syncConnection, widgetToken } from '../_shared/belvo.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!belvoConfigured()) throw new HttpError(501, 'La conexión bancaria no está configurada en el servidor');
    const { user, client } = await requireUser(req);
    const body = await req.json();
    const db = adminClient();

    switch (body.action) {
      case 'widget_token': {
        const { access } = await widgetToken();
        const redirect = encodeURIComponent(body.redirect ?? 'finanzas://belvo');
        const widgetUrl =
          `https://widget.belvo.io/?access_token=${access}&locale=es&country_codes=MX` +
          `&institution_types=retail,business&callback=${redirect}`;
        return json({ access, widgetUrl });
      }
      case 'register': {
        await requireMember(client, body.group_id);
        const { data, error } = await db
          .from('bank_connections')
          .upsert({
            group_id: body.group_id,
            user_id: user.id,
            link_id: body.link_id,
            institution: body.institution ?? null,
            payment_method_id: body.payment_method_id ?? null,
          }, { onConflict: 'link_id' })
          .select()
          .single();
        if (error) throw error;
        const imported = await syncConnection(db, data);
        return json({ connection: data, imported });
      }
      case 'sync': {
        const { data: conn } = await db.from('bank_connections').select('*').eq('id', body.connection_id).single();
        if (!conn) throw new HttpError(404, 'Conexión no encontrada');
        await requireMember(client, conn.group_id);
        const imported = await syncConnection(db, conn);
        return json({ imported });
      }
      case 'delete': {
        const { data: conn } = await db.from('bank_connections').select('*').eq('id', body.connection_id).single();
        if (!conn || conn.user_id !== user.id) throw new HttpError(403, 'Solo quien conectó la cuenta puede quitarla');
        await belvoFetch(`/api/links/${conn.link_id}/`, { method: 'DELETE' }).catch(() => null);
        await db.from('bank_connections').delete().eq('id', conn.id);
        return json({ ok: true });
      }
      default:
        throw new HttpError(400, 'Acción inválida');
    }
  } catch (e) {
    return handleError(e);
  }
});
