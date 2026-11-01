import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { fromISODate, prettyDate, toISODate } from '@/lib/dates';
import { radius, spacing, useColors } from '@/lib/theme';
import type { Category, Member, PaymentMethod } from '@/lib/types';
import { Avatar } from './Avatar';
import { Chip, IconCircle, Sheet, T } from './ui';

export function CategoryGrid({
  categories,
  value,
  onChange,
  suggested,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string) => void;
  suggested?: string | null;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {categories.map((cat) => {
        const sel = cat.id === value;
        const sug = cat.id === suggested && !sel;
        return (
          <Pressable
            key={cat.id}
            onPress={() => onChange(cat.id)}
            style={{
              width: '25%',
              padding: 4,
            }}
          >
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: radius.md,
                backgroundColor: sel ? cat.color + '22' : 'transparent',
                borderWidth: sel || sug ? 1.5 : 0,
                borderColor: sel ? cat.color : c.primary,
                borderStyle: sug ? 'dashed' : 'solid',
              }}
            >
              <IconCircle icon={cat.icon} color={cat.color} size={40} />
              <T variant="small" numberOfLines={2} center style={{ marginTop: 4, color: sel ? c.text : c.textMuted, fontWeight: sel ? '700' : '500' }}>
                {cat.name}
              </T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MemberPicker({ members, value, onChange }: { members: Member[]; value: string; onChange: (id: string) => void }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: 4 }}>
      {members.map((m) => {
        const sel = m.user_id === value;
        return (
          <Pressable key={m.user_id} onPress={() => onChange(m.user_id)} style={{ alignItems: 'center', width: 64, opacity: sel ? 1 : 0.55 }}>
            <Avatar user={m.profiles} size={48} ring={sel ? c.primary : undefined} />
            <T variant="small" numberOfLines={1} style={{ marginTop: 4, fontWeight: sel ? '700' : '500', color: sel ? c.text : c.textMuted }}>
              {m.profiles.full_name.split(' ')[0]}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MethodPicker({
  methods,
  value,
  onChange,
  onAdd,
}: {
  methods: PaymentMethod[];
  value: string | null;
  onChange: (id: string | null) => void;
  onAdd?: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      <Chip label="Ninguna" selected={!value} onPress={() => onChange(null)} />
      {methods
        .filter((m) => !m.archived)
        .map((m) => (
          <Chip
            key={m.id}
            label={m.name}
            icon={m.kind === 'credit' ? 'card' : m.kind === 'cash' ? 'cash' : 'wallet'}
            color={m.color}
            selected={value === m.id}
            onPress={() => onChange(m.id)}
          />
        ))}
      {onAdd && <Chip label="＋ Nueva tarjeta / cuenta" icon="add" onPress={onAdd} />}
    </ScrollView>
  );
}

export function DateField({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return (
      <View style={{ marginBottom: spacing.md }}>
        {label && <T variant="label" style={{ marginBottom: 6 }}>{label}</T>}
        {createElement('input', {
          type: 'date',
          value,
          onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
          style: { backgroundColor: c.inputBg, color: c.text, borderRadius: radius.md, padding: 14, border: 'none', fontSize: 16, width: '100%', boxSizing: 'border-box' },
        })}
      </View>
    );
  }
  const picker = (
    <DateTimePicker
      value={fromISODate(value)}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      locale="es-MX"
      onChange={(e, d) => {
        if (Platform.OS === 'android') setOpen(false);
        if (e.type === 'set' && d) onChange(toISODate(d));
      }}
    />
  );
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <T variant="label" style={{ marginBottom: 6 }}>{label}</T>}
      <Pressable
        onPress={() => setOpen(true)}
        style={{ backgroundColor: c.inputBg, borderRadius: radius.md, padding: 14, borderWidth: 0.5, borderColor: c.border }}
      >
        <T>{prettyDate(value)} · {value}</T>
      </Pressable>
      {open && Platform.OS === 'android' && picker}
      {Platform.OS === 'ios' && (
        <Sheet visible={open} onClose={() => setOpen(false)} title="Fecha">
          {picker}
        </Sheet>
      )}
    </View>
  );
}
