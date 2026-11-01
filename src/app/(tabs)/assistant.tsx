import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { IconButton, IconCircle, T } from '@/components/ui';
import { useBills, useBudgets, useCategories, useHistory, EMPTY } from '@/hooks/queries';
import { buildInsights } from '@/lib/insights';
import { useGroup, useSession } from '@/lib/session';
import { invokeFunction, supabase, unwrap } from '@/lib/supabase';
import { radius, spacing, useColors } from '@/lib/theme';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at?: string };

const PROMPTS = [
  '¿En qué estoy gastando de más este mes?',
  'Arma un presupuesto mensual con base en mi historial',
  '¿Cómo puedo ahorrar $2,000 más al mes?',
  '¿Qué pagos vienen esta semana y cuánto necesito?',
  'Dame ideas para aumentar nuestros ingresos',
  '¿Cómo vamos contra el mes pasado?',
  '¿Cuánto debería tener en mi fondo de emergencia?',
  '¿Quién del grupo no ha registrado ingresos?',
];

/** Render muy simple de markdown: **negritas** y viñetas */
function RichText({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const heading = /^#{1,3}\s/.test(line);
        const clean = line.replace(/^\s*[-*•]\s+/, '').replace(/^#{1,3}\s/, '');
        const parts = clean.split(/(\*\*[^*]+\*\*)/g);
        if (!clean.trim()) return <View key={i} style={{ height: 4 }} />;
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
            {bullet && <T color={color}>•</T>}
            <T color={color} style={{ flex: 1, lineHeight: 21, fontWeight: heading ? '700' : '400' }}>
              {parts.map((p, j) =>
                p.startsWith('**') ? (
                  <T key={j} color={color} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</T>
                ) : (
                  p
                ),
              )}
            </T>
          </View>
        );
      })}
    </View>
  );
}

export default function Assistant() {
  const c = useColors();
  const qc = useQueryClient();
  const { profile } = useSession();
  const { groupId, userId } = useGroup();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const list = useRef<FlatList<Msg>>(null);

  const history = useQuery({
    queryKey: ['assistant', groupId, userId],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('assistant_messages')
          .select('id, role, content, created_at')
          .eq('group_id', groupId)
          .eq('user_id', userId)
          .order('created_at')
          .limit(200),
      ) as Msg[],
  });

  // Consejos locales instantáneos como mensaje de bienvenida
  const tx = useHistory(6).data ?? EMPTY;
  const cats = useCategories().data ?? EMPTY;
  const budgets = useBudgets().data ?? EMPTY;
  const bills = useBills().data ?? EMPTY;
  const tips = useMemo(() => buildInsights({ history: tx, categories: cats, budgets, bills }).slice(0, 3), [tx, cats, budgets, bills]);

  const messages = [...(history.data ?? []), ...pending];

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length, thinking]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || thinking) return;
    setInput('');
    setPending([{ id: 'tmp-u', role: 'user', content: msg }]);
    setThinking(true);
    try {
      const { reply } = await invokeFunction<{ reply: string }>('fin-assistant', { group_id: groupId, message: msg });
      setPending([
        { id: 'tmp-u', role: 'user', content: msg },
        { id: 'tmp-a', role: 'assistant', content: reply },
      ]);
      await qc.invalidateQueries({ queryKey: ['assistant', groupId, userId] });
      setPending([]);
    } catch (e) {
      setPending([]);
      setInput(msg);
      Alert.alert('Asistente', (e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function clear() {
    Alert.alert('Borrar conversación', '¿Empezar de cero?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('assistant_messages').delete().eq('group_id', groupId).eq('user_id', userId);
          qc.invalidateQueries({ queryKey: ['assistant', groupId, userId] });
        },
      },
    ]);
  }

  const Header = (
    <View style={{ paddingBottom: spacing.md }}>
      <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
        <IconCircle icon="sparkles" color={c.primary} size={64} />
        <T variant="h2" style={{ marginTop: spacing.sm }}>Hola, soy Fin ✨</T>
        <T variant="muted" center style={{ marginTop: 4, paddingHorizontal: spacing.lg }}>
          Analizo los movimientos de tu grupo y te doy consejos para controlar gastos y mejorar ingresos.
        </T>
      </View>
      {tips.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', gap: spacing.sm, backgroundColor: c.card, borderRadius: radius.md, padding: spacing.md, marginBottom: 8 }}>
          <IconCircle icon={t.icon} color={t.color} size={32} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{t.title}</T>
            <T variant="small">{t.body}</T>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <T variant="h1">Asistente</T>
        <IconButton icon="refresh" onPress={clear} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={Header}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
          renderItem={({ item }) => {
            const mine = item.role === 'user';
            return (
              <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8, marginBottom: spacing.md }}>
                {!mine && <IconCircle icon="sparkles" color={c.primary} size={30} />}
                <View
                  style={{
                    maxWidth: '82%',
                    backgroundColor: mine ? c.primary : c.card,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    borderBottomRightRadius: mine ? 6 : radius.lg,
                    borderBottomLeftRadius: mine ? radius.lg : 6,
                  }}
                >
                  <RichText text={item.content} color={mine ? '#fff' : c.text} />
                </View>
                {mine && <Avatar user={profile} size={30} />}
              </View>
            );
          }}
          ListFooterComponent={
            thinking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconCircle icon="sparkles" color={c.primary} size={30} />
                <View style={{ backgroundColor: c.card, padding: spacing.md, borderRadius: radius.lg, flexDirection: 'row', gap: 8 }}>
                  <ActivityIndicator color={c.primary} size="small" />
                  <T variant="muted">Analizando tus finanzas…</T>
                </View>
              </View>
            ) : undefined
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
          {PROMPTS.map((p) => (
            <Pressable key={p} onPress={() => send(p)} style={{ backgroundColor: c.cardAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
              <T variant="small" style={{ color: c.text }}>{p}</T>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: 4 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Pregúntale a Fin…"
            placeholderTextColor={c.textMuted}
            multiline
            style={{ flex: 1, backgroundColor: c.card, color: c.text, borderRadius: radius.lg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, maxHeight: 120 }}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || thinking}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: input.trim() ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
