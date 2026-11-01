import { View } from 'react-native';
import { GroupForm } from '@/components/GroupForm';
import { Button, Screen, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { spacing } from '@/lib/theme';

export default function Onboarding() {
  const { profile, signOut } = useSession();
  return (
    <Screen>
      <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}>
        <T variant="h1">¡Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! 👋</T>
        <T variant="muted" style={{ marginTop: 6 }}>
          Crea un grupo para tu casa o familia, o únete con el código que te compartieron.
        </T>
      </View>
      <GroupForm />
      <Button title="Cerrar sesión" variant="ghost" onPress={signOut} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
