import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useColors } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshControl,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const inner = [padded && { padding: spacing.lg }, { paddingBottom: 120 }, contentStyle];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={inner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padded && { padding: spacing.lg }, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type TVariant = 'h1' | 'h2' | 'h3' | 'body' | 'muted' | 'small' | 'label' | 'money';
export function T({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  center,
}: {
  children: ReactNode;
  variant?: TVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const c = useColors();
  const base: Record<TVariant, TextStyle> = {
    h1: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: c.text },
    h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: c.text },
    h3: { fontSize: 17, fontWeight: '700', color: c.text },
    body: { fontSize: 15, color: c.text },
    muted: { fontSize: 14, color: c.textMuted },
    small: { fontSize: 12, color: c.textMuted },
    label: { fontSize: 13, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    money: { fontSize: 16, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  };
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[base[variant], color ? { color } : null, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const c = useColors();
  const s = [styles.card, { backgroundColor: c.card, borderColor: c.border }, style];
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
        {children}
      </Pressable>
    );
  return <View style={s}>{children}</View>;
}

export function GradientCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <LinearGradient colors={c.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.gradient, style]}>
      {children}
    </LinearGradient>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const bg = {
    primary: c.primary,
    secondary: c.cardAlt,
    ghost: 'transparent',
    danger: c.expense,
    success: c.income,
  }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? c.primary : '#fff';
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        small && { paddingVertical: 8, paddingHorizontal: 14 },
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
          <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, size = 22, bg }: { icon: IconName; onPress?: () => void; color?: string; size?: number; bg?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg ?? c.cardAlt, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <T variant="label" style={{ marginBottom: 6 }}>{label}</T>}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...props}
        style={[styles.input, { backgroundColor: c.inputBg, color: c.text, borderColor: c.border }, style]}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  const c = useColors();
  const active = color ?? c.primary;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={[
        styles.chip,
        { backgroundColor: selected ? active : c.cardAlt, borderColor: selected ? active : c.border },
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? '#fff' : c.textMuted} />}
      <Text style={{ color: selected ? '#fff' : c.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string; color?: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.cardAlt }]}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[styles.segmentItem, sel && { backgroundColor: o.color ?? c.card, shadowOpacity: 0.08 }]}
          >
            <Text style={{ fontWeight: '700', color: sel ? (o.color ? '#fff' : c.text) : c.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color, height = 8, track }: { value: number; color?: string; height?: number; track?: string }) {
  const c = useColors();
  const v = Math.max(0, Math.min(1, value));
  const col = color ?? (value >= 1 ? c.expense : value >= 0.8 ? c.warning : c.income);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? c.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height, backgroundColor: col }} />
    </View>
  );
}

export function IconCircle({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon as IconName} size={size * 0.5} color={color} />
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.sectionHeader}>
      <T variant="h3">{title}</T>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: c.primary, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ListItem({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  chevron = true,
}: {
  icon?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.7 }]}>
      {icon && <IconCircle icon={icon} color={iconColor ?? c.primary} size={38} />}
      <View style={{ flex: 1 }}>
        <T variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? <T variant="small" numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right}
      {onPress && chevron && <Ionicons name="chevron-forward" size={18} color={c.textMuted} />}
    </Pressable>
  );
}

export function SwitchRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={styles.listItem}>
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }}>{title}</T>
        {subtitle ? <T variant="small">{subtitle}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary }} />
    </View>
  );
}

export function EmptyState({ icon, title, body, action, onAction }: { icon: string; title: string; body?: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', padding: spacing.xxl, gap: spacing.sm }}>
      <IconCircle icon={icon} color={c.primary} size={64} />
      <T variant="h3" center>{title}</T>
      {body && <T variant="muted" center>{body}</T>}
      {action && <Button title={action} onPress={onAction} small style={{ marginTop: spacing.sm }} />}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {title && <T variant="h2" style={{ marginBottom: spacing.md }}>{title}</T>}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: spacing.xs }} />;
}

export function Badge({ count }: { count: number }) {
  const c = useColors();
  if (!count) return null;
  return (
    <View style={[styles.badge, { backgroundColor: c.expense }]}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  gradient: { borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: { flexDirection: 'row', borderRadius: radius.md, padding: 4, marginBottom: spacing.md },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    shadowColor: '#000',
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: spacing.lg },
  badge: { position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
