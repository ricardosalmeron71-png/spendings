import { ScrollView, Text, View } from 'react-native';

/** Se muestra si faltan las variables de entorno de Supabase. */
export function SetupRequired() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, backgroundColor: '#0D0F1A' }}>
      <Text style={{ fontSize: 44, textAlign: 'center' }}>🔧</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginVertical: 12 }}>
        Falta conectar Supabase
      </Text>
      <View style={{ backgroundColor: '#171A2B', borderRadius: 16, padding: 16 }}>
        <Text style={{ color: '#C9CBE0', lineHeight: 22 }}>
          1. Copia <Text style={{ fontWeight: '700' }}>.env.example</Text> como <Text style={{ fontWeight: '700' }}>.env</Text>
          {'\n'}2. Llena EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
          {'\n'}3. Reinicia con <Text style={{ fontWeight: '700' }}>npx expo start -c</Text>
          {'\n\n'}Revisa SETUP.md para la guía completa.
        </Text>
      </View>
    </ScrollView>
  );
}
