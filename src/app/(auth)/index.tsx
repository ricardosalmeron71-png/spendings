import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Input, Segmented, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { radius, spacing, useColors } from '@/lib/theme';

export default function SignIn() {
  const c = useColors();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.includes('@') || password.length < 6) {
      Alert.alert('Revisa tus datos', 'Correo válido y contraseña de al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() || email.split('@')[0] } },
        });
        if (error) throw error;
        if (!data.session) Alert.alert('Revisa tu correo', 'Te enviamos un enlace para confirmar tu cuenta.');
      }
    } catch (e) {
      Alert.alert('Ups', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.includes('@')) return Alert.alert('Escribe tu correo primero');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert(error ? 'Error' : 'Listo', error?.message ?? 'Te enviamos un correo para restablecer tu contraseña.');
  }

  return (
    <LinearGradient colors={c.gradient} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
            <Text style={{ fontSize: 56 }}>💰</Text>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 8 }}>Finanzas en Grupo</Text>
            <Text style={{ color: '#ffffffcc', fontSize: 15, marginTop: 6, textAlign: 'center' }}>
              Controla gastos, ingresos y metas con tu familia. Con asistente inteligente.
            </Text>
          </View>
          <View style={{ backgroundColor: c.card, borderRadius: radius.xl, padding: spacing.xl }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'in', label: 'Entrar' },
                { value: 'up', label: 'Crear cuenta' },
              ]}
            />
            {mode === 'up' && <Input label="Tu nombre" value={name} onChangeText={setName} placeholder="Ricardo Salmerón" autoCapitalize="words" />}
            <Input label="Correo" value={email} onChangeText={setEmail} placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Input label="Contraseña" value={password} onChangeText={setPassword} placeholder="••••••" secureTextEntry autoComplete="password" />
            <Button title={mode === 'in' ? 'Entrar' : 'Crear cuenta'} onPress={submit} loading={busy} />
            {mode === 'in' && <Button title="Olvidé mi contraseña" variant="ghost" onPress={forgot} small style={{ marginTop: 8 }} />}
          </View>
          <T variant="small" center color="#ffffffaa" style={{ marginTop: spacing.lg }}>
            Tus datos se guardan cifrados en tu propio proyecto de Supabase.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
