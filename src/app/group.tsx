import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Chip, Divider, Input, Screen, SectionHeader, Sheet, SwitchRow, T } from '@/components/ui';
import { useMembers } from '@/hooks/queries';
import { WEEKDAYS } from '@/lib/dates';
import { useGroup, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { spacing, useColors } from '@/lib/theme';
import type { Member, MemberRole } from '@/lib/types';

const ROLE: Record<MemberRole, string> = { owner: 'Dueño', admin: 'Admin', member: 'Miembro' };

export default function GroupScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { refresh } = useSession();
  const { group, userId } = useGroup();
  const members = useMembers().data ?? [];
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  const [name, setName] = useState(group.name);
  const [selected, setSelected] = useState<Member | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['members', group.id] });
    refresh();
  };

  async function share() {
    await Share.share({
      message: `¡Únete a "${group.name}" en spendings$$! 💰\nDescarga la app y usa el código: ${group.invite_code}`,
    });
  }

  async function updateGroup(patch: Record<string, unknown>) {
    const { error } = await supabase.from('groups').update(patch).eq('id', group.id);
    if (error) Alert.alert('Error', error.message);
    invalidate();
  }

  async function newCode() {
    const { error } = await supabase.rpc('regenerate_invite_code', { p_group: group.id });
    if (error) return Alert.alert('Error', error.message);
    invalidate();
  }

  async function updateMember(m: Member, patch: Partial<Member>) {
    const { error } = await supabase.from('group_members').update(patch).eq('group_id', group.id).eq('user_id', m.user_id);
    if (error) return Alert.alert('Error', error.message);
    setSelected(null);
    invalidate();
  }

  async function removeMember(m: Member) {
    Alert.alert('Quitar del grupo', `¿Quitar a ${m.profiles.full_name}? Sus movimientos se conservan.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', m.user_id);
          setSelected(null);
          invalidate();
        },
      },
    ]);
  }

  async function leave() {
    Alert.alert('Salir del grupo', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await supabase.rpc('leave_group', { p_group: group.id });
          await qc.invalidateQueries();
          refresh();
        },
      },
    ]);
  }

  return (
    <Screen edges={[]}>
      <Card style={{ alignItems: 'center' }}>
        <T style={{ fontSize: 44 }}>{group.emoji}</T>
        <T variant="h2">{group.name}</T>
        <T variant="small" style={{ marginTop: spacing.md }}>Código de invitación</T>
        <Pressable
          onPress={async () => {
            await Clipboard.setStringAsync(group.invite_code);
            Alert.alert('Copiado', 'Código copiado al portapapeles');
          }}
        >
          <T style={{ fontSize: 34, fontWeight: '800', letterSpacing: 8, color: c.primary }}>{group.invite_code}</T>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' }}>
          <Button title="Invitar" icon="share-social" style={{ flex: 1 }} onPress={share} />
          {isAdmin && <Button title="Nuevo código" variant="secondary" small onPress={newCode} />}
        </View>
      </Card>

      {me?.notify_activity !== undefined && (
        <Card style={{ paddingVertical: 0 }}>
          <SwitchRow
            title="Avisarme de movimientos de otros"
            subtitle="Recibe una notificación cuando alguien del grupo registre un gasto o ingreso"
            value={me.notify_activity}
            onChange={async (v) => {
              const { error } = await supabase.rpc('set_my_notify_activity', { p_group: group.id, p_value: v });
              if (error) Alert.alert('No se pudo guardar', error.message);
              invalidate();
            }}
          />
        </Card>
      )}

      <SectionHeader title={`Miembros (${members.length})`} />
      <Card style={{ paddingVertical: 4 }}>
        {members.map((m, i) => (
          <View key={m.user_id}>
            {i > 0 && <Divider />}
            <Pressable
              disabled={!isAdmin}
              onPress={() => setSelected(m)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 }}
            >
              <Avatar user={m.profiles} size={44} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{m.profiles.full_name}{m.user_id === userId ? ' (tú)' : ''}</T>
                <T variant="small">
                  {ROLE[m.role]}
                  {m.requires_weekly_income ? ' · registro semanal' : ' · exento de registro'}
                </T>
              </View>
            </Pressable>
          </View>
        ))}
      </Card>

      {isAdmin && (
        <>
          <SectionHeader title="Ajustes del grupo" />
          <Card>
            <Input label="Nombre" value={name} onChangeText={setName} onEndEditing={() => name.trim() && name !== group.name && updateGroup({ name: name.trim() })} />
            <T variant="label" style={{ marginBottom: 6 }}>Día de registro semanal de ingresos</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {WEEKDAYS.map((d, i) => (
                <Chip key={d} label={d.slice(0, 3)} selected={group.income_check_weekday === i} onPress={() => updateGroup({ income_check_weekday: i })} />
              ))}
            </View>
            <T variant="small" style={{ marginTop: spacing.sm }}>
              Ese día a las 10:00 se recuerda a quien no ha registrado y a las 20:00 se avisa al grupo quién falta.
            </T>
          </Card>
        </>
      )}

      <Button title="Salir del grupo" variant="ghost" onPress={leave} />

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.profiles.full_name}>
        {selected && (
          <>
            <T variant="label" style={{ marginBottom: 6 }}>Rol</T>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
              {(['admin', 'member'] as MemberRole[]).map((r) => (
                <Chip key={r} label={ROLE[r]} selected={selected.role === r} onPress={() => selected.role !== 'owner' && updateMember(selected, { role: r })} />
              ))}
            </View>
            <SwitchRow
              title="Debe registrar ingresos cada semana"
              subtitle="Si está activo, se le avisa y se notifica al grupo si no registra"
              value={selected.requires_weekly_income}
              onChange={(v) => updateMember(selected, { requires_weekly_income: v })}
            />
            {selected.role !== 'owner' && selected.user_id !== userId && (
              <Button title="Quitar del grupo" variant="danger" onPress={() => removeMember(selected)} style={{ marginTop: spacing.md }} />
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
