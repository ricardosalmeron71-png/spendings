import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Input, Loading, Screen, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { AVATAR_COLORS, AVATAR_EMOJIS, spacing, useColors } from '@/lib/theme';
import type { Profile as ProfileT } from '@/lib/types';
import { uploadAvatar } from '@/lib/upload';

export default function Profile() {
  const { profile } = useSession();
  if (!profile) return <Loading />;
  return <ProfileForm key={profile.id} profile={profile} />;
}

function ProfileForm({ profile }: { profile: ProfileT }) {
  const c = useColors();
  const qc = useQueryClient();
  const { session } = useSession();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [emoji, setEmoji] = useState(profile?.avatar_emoji ?? '😀');
  const [color, setColor] = useState(profile?.avatar_color ?? AVATAR_COLORS[0]);
  const [photo, setPhoto] = useState<string | null>(profile?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);


  async function choosePhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    setBusy(true);
    try {
      const url = await uploadAvatar(session!.user.id, res.assets[0].uri);
      setPhoto(url);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), avatar_emoji: emoji, avatar_color: color, avatar_url: photo })
      .eq('id', session!.user.id);
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    await qc.invalidateQueries({ queryKey: ['profile'] });
    await qc.invalidateQueries({ queryKey: ['members'] });
    Alert.alert('Perfil actualizado ✅');
  }

  const preview = { full_name: name, avatar_emoji: emoji, avatar_color: color, avatar_url: photo };

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
        <Avatar user={preview} size={110} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Button title="Subir foto" icon="camera" small variant="secondary" onPress={choosePhoto} loading={busy} />
          {photo && <Button title="Usar emoji" small variant="ghost" onPress={() => setPhoto(null)} />}
        </View>
      </View>
      <Input label="Nombre" value={name} onChangeText={setName} />
      <T variant="small" style={{ marginBottom: spacing.md }}>{session?.user.email}</T>

      {!photo && (
        <>
          <T variant="label" style={{ marginBottom: 6 }}>Emoji</T>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {AVATAR_EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => setEmoji(e)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? color : c.cardAlt }}>
                  <T style={{ fontSize: 24 }}>{e}</T>
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      )}
      <T variant="label" style={{ marginBottom: 6 }}>Color</T>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {AVATAR_COLORS.map((col) => (
            <Pressable key={col} onPress={() => setColor(col)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: col, borderWidth: color === col ? 3 : 0, borderColor: c.text }} />
          ))}
        </View>
      </Card>
      <Button title="Guardar" icon="save" onPress={save} loading={busy} />
    </Screen>
  );
}
