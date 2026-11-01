import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { Button, Card, Chip, Input, Segmented, T } from './ui';

const EMOJIS = ['🏠', '👨‍👩‍👧', '❤️', '🏡', '🧑‍🤝‍🧑', '💼', '✈️', '🐶'];

export function GroupForm({ onDone }: { onDone?: () => void }) {
  const { refresh, setActiveGroup } = useSession();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { data, error } =
        mode === 'create'
          ? await supabase.rpc('create_group', { p_name: name.trim() || 'Mi casa', p_emoji: emoji })
          : await supabase.rpc('join_group', { p_code: code.trim() });
      if (error) throw error;
      await setActiveGroup((data as { id: string }).id);
      await refresh();
      await qc.invalidateQueries();
      onDone?.();
    } catch (e) {
      Alert.alert('No se pudo', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: 'Crear grupo' },
          { value: 'join', label: 'Tengo un código' },
        ]}
      />
      {mode === 'create' ? (
        <Card>
          <Input label="Nombre del grupo" value={name} onChangeText={setName} placeholder="Casa Salmerón" />
          <T variant="label" style={{ marginBottom: 8 }}>Ícono</T>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
            {EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
            ))}
          </ScrollView>
          <T variant="small" style={{ marginTop: spacing.md }}>
            Crearemos categorías iniciales (Casa, Servicios, Carro, Médico, etc.) que puedes editar después.
          </T>
        </Card>
      ) : (
        <Card>
          <Input
            label="Código de invitación"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            maxLength={6}
            style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }}
          />
          <T variant="small">Pídele el código a quien administra el grupo (Más → Mi grupo).</T>
        </Card>
      )}
      <Button title={mode === 'create' ? 'Crear y continuar' : 'Unirme'} onPress={submit} loading={busy} disabled={mode === 'join' && code.length < 6} />
    </View>
  );
}
