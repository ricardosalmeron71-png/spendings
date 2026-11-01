import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, Share, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { TransactionRow } from '@/components/TransactionRow';
import { Chip, EmptyState, IconButton, Sheet, T } from '@/components/ui';
import { useCategories, useMembers, useMonthTransactions, usePaymentMethods, EMPTY } from '@/hooks/queries';
import { addMonths, monthLabel, monthStart, prettyDate, today } from '@/lib/dates';
import { money } from '@/lib/format';
import { totals } from '@/lib/insights';
import { radius, spacing, useColors } from '@/lib/theme';
import type { Transaction } from '@/lib/types';

type KindFilter = 'all' | 'income' | 'expense';

export default function Transactions() {
  const c = useColors();
  const params = useLocalSearchParams<{ review?: string }>();
  const [month, setMonth] = useState(monthStart(today()));
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [member, setMember] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(params.review === '1');
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const [catSheet, setCatSheet] = useState(false);

  const txQ = useMonthTransactions(month);
  const cats = useCategories().data ?? EMPTY;
  const members = useMembers().data ?? [];
  const methods = usePaymentMethods().data ?? [];
  const catById = useMemo(() => new Map(cats.map((x) => [x.id, x])), [cats]);
  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const methodById = new Map(methods.map((m) => [m.id, m]));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (txQ.data ?? []).filter((t) => {
      if (kind !== 'all' && t.kind !== kind) return false;
      if (member && t.user_id !== member) return false;
      if (category && t.category_id !== category) return false;
      if (onlyReview && !t.needs_review) return false;
      if (onlyEvidence && !(t.transaction_attachments?.[0]?.count ?? 0)) return false;
      if (term) {
        const hay = `${t.description} ${t.notes ?? ''} ${catById.get(t.category_id ?? '')?.name ?? ''} ${t.amount}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [txQ.data, q, kind, member, category, onlyReview, onlyEvidence, catById]);

  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) map.set(t.occurred_on, [...(map.get(t.occurred_on) ?? []), t]);
    return [...map.entries()].map(([date, data]) => ({ date, data, total: totals(data) }));
  }, [filtered]);

  const tot = totals(filtered);
  const isCurrent = month.slice(0, 7) === today().slice(0, 7);

  async function exportCsv() {
    const header = 'Fecha,Quién,Tipo,Descripción,Categoría,Monto,Forma de pago';
    const rows = filtered.map((t) =>
      [
        t.occurred_on,
        memberById.get(t.user_id)?.profiles.full_name ?? '',
        t.kind === 'income' ? 'Ingreso' : 'Egreso',
        `"${(t.description ?? '').replace(/"/g, "'")}"`,
        catById.get(t.category_id ?? '')?.name ?? '',
        t.amount,
        methodById.get(t.payment_method_id ?? '')?.name ?? '',
      ].join(','),
    );
    await Share.share({ title: `Movimientos ${monthLabel(month)}`, message: [header, ...rows].join('\n') });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T variant="h1">Movimientos</T>
          <IconButton icon="share-outline" onPress={exportCsv} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm }}>
          <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, -1))}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Pressable>
          <T variant="h3">{monthLabel(month)}</T>
          <Pressable hitSlop={12} disabled={isCurrent} onPress={() => setMonth(addMonths(month, 1))}>
            <Ionicons name="chevron-forward" size={22} color={isCurrent ? c.border : c.text} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.md, padding: spacing.md }}>
            <T variant="small">Ingresos</T>
            <T variant="money" color={c.income}>{money(tot.income, false)}</T>
          </View>
          <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.md, padding: spacing.md }}>
            <T variant="small">Gastos</T>
            <T variant="money" color={c.expense}>{money(tot.expense, false)}</T>
          </View>
          <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.md, padding: spacing.md }}>
            <T variant="small">Balance</T>
            <T variant="money">{money(tot.net, false)}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.inputBg, borderRadius: radius.md, paddingHorizontal: 12, marginBottom: spacing.sm }}>
          <Ionicons name="search" size={18} color={c.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar descripción, categoría o monto"
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, color: c.text, fontSize: 15 }}
          />
          {q ? <Ionicons name="close-circle" size={18} color={c.textMuted} onPress={() => setQ('')} /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
          <Chip label="Todos" selected={kind === 'all'} onPress={() => setKind('all')} />
          <Chip label="Ingresos" icon="arrow-down" color={c.income} selected={kind === 'income'} onPress={() => setKind('income')} />
          <Chip label="Gastos" icon="arrow-up" color={c.expense} selected={kind === 'expense'} onPress={() => setKind('expense')} />
          <Chip
            label={category ? catById.get(category)?.name ?? 'Categoría' : 'Categoría'}
            icon="pricetags"
            selected={!!category}
            onPress={() => (category ? setCategory(null) : setCatSheet(true))}
          />
          <Chip label="Con evidencia" icon="image" selected={onlyEvidence} onPress={() => setOnlyEvidence(!onlyEvidence)} />
          <Chip label="Por revisar" icon="alert-circle" color={c.warning} selected={onlyReview} onPress={() => setOnlyReview(!onlyReview)} />
        </ScrollView>
        {members.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: spacing.sm }}>
            {members.map((m) => (
              <Pressable key={m.user_id} onPress={() => setMember(member === m.user_id ? null : m.user_id)} style={{ opacity: !member || member === m.user_id ? 1 : 0.4 }}>
                <Avatar user={m.profiles} size={34} ring={member === m.user_id ? c.primary : undefined} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={txQ.isRefetching} onRefresh={() => { txQ.refetch(); }} />}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: 4 }}>
            <T variant="label">{prettyDate(section.date)}</T>
            <T variant="small">
              {section.total.expense ? `-${money(section.total.expense, false)}` : ''}
              {section.total.income ? `  +${money(section.total.income, false)}` : ''}
            </T>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.card, paddingHorizontal: spacing.md, borderRadius: radius.md, marginBottom: 6 }}>
            <TransactionRow
              t={item}
              category={item.category_id ? catById.get(item.category_id) : undefined}
              member={memberById.get(item.user_id)}
              method={item.payment_method_id ? methodById.get(item.payment_method_id) : undefined}
            />
          </View>
        )}
        ListEmptyComponent={
          txQ.isLoading ? undefined : (
            <EmptyState icon="receipt-outline" title="Sin movimientos" body="No hay movimientos con estos filtros." />
          )
        }
      />

      <Sheet visible={catSheet} onClose={() => setCatSheet(false)} title="Filtrar por categoría">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {cats
            .filter((x) => kind === 'all' || x.kind === kind)
            .map((x) => (
              <Chip
                key={x.id}
                label={x.name}
                color={x.color}
                selected={category === x.id}
                onPress={() => {
                  setCategory(x.id);
                  setCatSheet(false);
                }}
              />
            ))}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
