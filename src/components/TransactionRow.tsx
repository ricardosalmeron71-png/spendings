import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { prettyDate } from '@/lib/dates';
import { money } from '@/lib/format';
import { spacing, useColors } from '@/lib/theme';
import type { Category, Member, PaymentMethod, Transaction } from '@/lib/types';
import { Avatar } from './Avatar';
import { IconCircle, T } from './ui';

export function TransactionRow({
  t,
  category,
  member,
  method,
  showDate = false,
}: {
  t: Transaction;
  category?: Category;
  member?: Member;
  method?: PaymentMethod;
  showDate?: boolean;
}) {
  const c = useColors();
  const isIncome = t.kind === 'income';
  const attachments = t.transaction_attachments?.[0]?.count ?? 0;
  const sub = [category?.name ?? (isIncome ? 'Ingreso' : 'Sin categoría'), method?.name, showDate ? prettyDate(t.occurred_on) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => router.push(`/transaction/${t.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
    >
      <View>
        <IconCircle icon={category?.icon ?? (isIncome ? 'arrow-down' : 'pricetag')} color={category?.color ?? (isIncome ? c.income : c.textMuted)} size={44} />
        {member && (
          <View style={{ position: 'absolute', right: -4, bottom: -4 }}>
            <Avatar user={member.profiles} size={20} ring={c.card} />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
            {t.description || category?.name || 'Movimiento'}
          </T>
          {attachments > 0 && <Ionicons name="image" size={13} color={c.textMuted} />}
          {t.needs_review && <Ionicons name="alert-circle" size={14} color={c.warning} />}
        </View>
        <T variant="small" numberOfLines={1}>{sub}</T>
      </View>
      <T variant="money" color={isIncome ? c.income : c.text}>
        {isIncome ? '+' : '-'}
        {money(t.amount)}
      </T>
    </Pressable>
  );
}
