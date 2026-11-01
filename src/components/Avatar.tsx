import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useColors } from '@/lib/theme';

type AvatarData = {
  full_name?: string | null;
  avatar_url?: string | null;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
};

export function Avatar({ user, size = 40, ring }: { user?: AvatarData | null; size?: number; ring?: string }) {
  const c = useColors();
  const bg = user?.avatar_color ?? c.primary;
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    borderWidth: ring ? 2 : 0,
    borderColor: ring,
  };
  if (user?.avatar_url) {
    return (
      <View style={style}>
        <Image source={{ uri: user.avatar_url }} style={{ width: size, height: size }} contentFit="cover" transition={200} />
      </View>
    );
  }
  const initials = (user?.full_name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={style}>
      <Text style={{ fontSize: size * (user?.avatar_emoji ? 0.55 : 0.4), color: '#fff', fontWeight: '700' }}>
        {user?.avatar_emoji || initials}
      </Text>
    </View>
  );
}

export function AvatarStack({ users, size = 28, max = 4 }: { users: AvatarData[]; size?: number; max?: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row' }}>
      {users.slice(0, max).map((u, i) => (
        <View key={i} style={{ marginLeft: i ? -size / 3 : 0 }}>
          <Avatar user={u} size={size} ring={c.card} />
        </View>
      ))}
      {users.length > max && (
        <View
          style={{
            marginLeft: -size / 3,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c.cardAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '700' }}>+{users.length - max}</Text>
        </View>
      )}
    </View>
  );
}
