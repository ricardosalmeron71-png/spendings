import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { addMonths, monthEnd, monthStart, today, weekStart } from '@/lib/dates';
import { useGroup } from '@/lib/session';
import { supabase, unwrap } from '@/lib/supabase';
import type {
  AppNotification,
  Attachment,
  BankConnection,
  Bill,
  Budget,
  Category,
  Member,
  MonthlyPlan,
  PaymentMethod,
  SavingsGoal,
  Transaction,
  WeeklyIncomeStatus,
} from '@/lib/types';

const TXN_SELECT = '*, transaction_attachments(count)';

// ---------------------------------------------------------------------------
// Realtime: cualquier cambio de otro miembro refresca la app al instante
// ---------------------------------------------------------------------------
export function useGroupRealtime() {
  const { groupId, userId } = useGroup();
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `group_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ['transactions', groupId] });
        qc.invalidateQueries({ queryKey: ['weekly', groupId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `group_id=eq.${groupId}` }, () =>
        qc.invalidateQueries({ queryKey: ['bills', groupId] }),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ['notifications', userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, userId, qc]);
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------
export function useCategories() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['categories', groupId],
    enabled: !!groupId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.from('categories').select('*').eq('group_id', groupId).order('name')) as Category[],
  });
}

export function usePaymentMethods() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['payment_methods', groupId],
    enabled: !!groupId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.from('payment_methods').select('*').eq('group_id', groupId).order('name')) as PaymentMethod[],
  });
}

export function useMembers() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['members', groupId],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('group_members')
          .select('group_id, user_id, role, requires_weekly_income, profiles(id, full_name, avatar_url, avatar_emoji, avatar_color)')
          .eq('group_id', groupId)
          .order('joined_at'),
      ) as unknown as Member[],
  });
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------
export function useTransactions(range: { from: string; to: string }) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['transactions', groupId, range.from, range.to],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('transactions')
          .select(TXN_SELECT)
          .eq('group_id', groupId)
          .gte('occurred_on', range.from)
          .lte('occurred_on', range.to)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5000),
      ) as Transaction[],
  });
}

export function useMonthTransactions(month: string) {
  return useTransactions({ from: monthStart(month), to: monthEnd(month) });
}

/** Historial de ~6 meses para métricas, insights y sugerencias */
export function useHistory(months = 6) {
  const t = today();
  return useTransactions({ from: addMonths(monthStart(t), -(months - 1)), to: monthEnd(t) });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ['transaction', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('transactions').select('*').eq('id', id!).single()) as Transaction,
  });
}

export function useAttachments(transactionId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', transactionId],
    enabled: !!transactionId,
    queryFn: async () =>
      unwrap(
        await supabase.from('transaction_attachments').select('*').eq('transaction_id', transactionId!).order('created_at'),
      ) as Attachment[],
  });
}

export type TxnInput = Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'occurred_on' | 'user_id'>;

export function useSaveTransaction() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (input: TxnInput & { id?: string }) => {
      const { id, transaction_attachments: _a, ...rest } = input;
      const payload = { ...rest, group_id: groupId, needs_review: false };
      if (id) return unwrap(await supabase.from('transactions').update(payload).eq('id', id).select().single()) as Transaction;
      return unwrap(await supabase.from('transactions').insert(payload).select().single()) as Transaction;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['transactions', groupId] });
      qc.invalidateQueries({ queryKey: ['transaction', t.id] });
      qc.invalidateQueries({ queryKey: ['weekly', groupId] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (t: Transaction) => {
      const atts = unwrap(await supabase.from('transaction_attachments').select('storage_path').eq('transaction_id', t.id)) as {
        storage_path: string;
      }[];
      if (atts.length) await supabase.storage.from('evidence').remove(atts.map((a) => a.storage_path));
      unwrap(await supabase.from('transactions').delete().eq('id', t.id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions', groupId] }),
  });
}

// ---------------------------------------------------------------------------
// Pagos recurrentes
// ---------------------------------------------------------------------------
export function useBills() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['bills', groupId],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(await supabase.from('bills').select('*').eq('group_id', groupId).order('next_due_date')) as Bill[],
  });
}

export function useSaveBill() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (b: Partial<Bill>) => {
      const { id, ...rest } = b;
      const payload = { ...rest, group_id: groupId };
      if (id) return unwrap(await supabase.from('bills').update(payload).eq('id', id).select().single()) as Bill;
      return unwrap(await supabase.from('bills').insert(payload).select().single()) as Bill;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bills', groupId] }),
  });
}

export function usePayBill() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (p: { bill: Bill; amount?: number; paymentMethodId?: string | null; date?: string }) =>
      unwrap(
        await supabase.rpc('pay_bill', {
          p_bill: p.bill.id,
          p_amount: p.amount ?? null,
          p_date: p.date ?? today(),
          p_payment_method: p.paymentMethodId ?? null,
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills', groupId] });
      qc.invalidateQueries({ queryKey: ['transactions', groupId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Presupuestos, plan y metas
// ---------------------------------------------------------------------------
export function useBudgets() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['budgets', groupId],
    enabled: !!groupId,
    queryFn: async () => unwrap(await supabase.from('budgets').select('*').eq('group_id', groupId)) as Budget[],
  });
}

export function useSaveBudget() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (b: Partial<Budget>) => {
      const { id, ...rest } = b;
      if (id) return unwrap(await supabase.from('budgets').update(rest).eq('id', id).select().single());
      return unwrap(await supabase.from('budgets').insert({ ...rest, group_id: groupId }).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', groupId] }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('budgets').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', groupId] }),
  });
}

export function usePlan(month: string) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['plan', groupId, monthStart(month)],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(
        await supabase.from('monthly_plans').select('*').eq('group_id', groupId).eq('month', monthStart(month)).maybeSingle(),
      ) as MonthlyPlan | null,
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  const { groupId } = useGroup();
  return useMutation({
    mutationFn: async (p: Partial<MonthlyPlan> & { month: string }) =>
      unwrap(
        await supabase
          .from('monthly_plans')
          .upsert({ ...p, group_id: groupId, month: monthStart(p.month) }, { onConflict: 'group_id,month' })
          .select()
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', groupId] }),
  });
}

export function useGoals() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['goals', groupId],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(await supabase.from('savings_goals').select('*').eq('group_id', groupId).order('created_at')) as SavingsGoal[],
  });
}

// ---------------------------------------------------------------------------
// Registro semanal
// ---------------------------------------------------------------------------
export function useWeeklyStatus(week?: string) {
  const { groupId } = useGroup();
  const ws = weekStart(week ?? today());
  return useQuery({
    queryKey: ['weekly', groupId, ws],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(await supabase.rpc('weekly_income_status', { p_group: groupId, p_week: ws })) as WeeklyIncomeStatus[],
  });
}

export function useMarkNoIncome() {
  const qc = useQueryClient();
  const { groupId, userId } = useGroup();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await supabase.from('income_checkins').upsert({
          group_id: groupId,
          user_id: userId,
          week_start: weekStart(today()),
          status: 'no_income',
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekly', groupId] }),
  });
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------
export function useNotifications() {
  const { userId } = useGroup();
  return useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      ) as AppNotification[],
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const { userId } = useGroup();
  return useMutation({
    mutationFn: async () =>
      unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', userId] }),
  });
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------
export function useBankConnections() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ['bank', groupId],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap(await supabase.from('bank_connections').select('*').eq('group_id', groupId).order('created_at')) as BankConnection[],
  });
}

/** Arreglo vacío estable (evita recalcular useMemo cuando aún no hay datos) */
export const EMPTY: never[] = [];
