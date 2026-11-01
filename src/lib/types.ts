export type TxnKind = 'income' | 'expense' | 'transfer';
export type MemberRole = 'owner' | 'admin' | 'member';
export type BillFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'yearly';
export type PaymentKind = 'cash' | 'debit' | 'credit' | 'payroll' | 'savings' | 'other';

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  currency: string;
  active_group_id: string | null;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  currency: string;
  invite_code: string;
  owner_id: string;
  income_check_weekday: number;
  timezone: string;
}

export interface Member {
  group_id: string;
  user_id: string;
  role: MemberRole;
  requires_weekly_income: boolean;
  notify_activity?: boolean;
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'avatar_emoji' | 'avatar_color'>;
}

export interface Category {
  id: string;
  group_id: string;
  name: string;
  kind: TxnKind;
  type: string;
  icon: string;
  color: string;
  is_essential: boolean;
  archived: boolean;
}

export interface PaymentMethod {
  id: string;
  group_id: string;
  owner_id: string | null;
  name: string;
  kind: PaymentKind;
  institution: string | null;
  last4: string | null;
  credit_limit: number | null;
  cut_day: number | null;
  due_day: number | null;
  color: string;
  archived: boolean;
}

export interface Transaction {
  id: string;
  group_id: string;
  user_id: string;
  kind: TxnKind;
  amount: number;
  category_id: string | null;
  payment_method_id: string | null;
  bill_id: string | null;
  goal_id: string | null;
  description: string;
  notes: string | null;
  occurred_on: string;
  tags: string[];
  bank_txn_id: string | null;
  needs_review: boolean;
  created_at: string;
  transaction_attachments?: { count: number }[];
}

export interface Attachment {
  id: string;
  transaction_id: string;
  group_id: string;
  storage_path: string;
  created_at: string;
}

export interface Bill {
  id: string;
  group_id: string;
  name: string;
  amount: number;
  category_id: string | null;
  payment_method_id: string | null;
  assigned_to: string | null;
  frequency: BillFrequency;
  next_due_date: string;
  cutoff_date: string | null;
  remind_days_before: number;
  period_paid: number;
  autopay: boolean;
  notes: string | null;
  active: boolean;
}

export interface Budget {
  id: string;
  group_id: string;
  category_id: string | null;
  amount: number;
  alert_percent: number;
}

export interface MonthlyPlan {
  id: string;
  group_id: string;
  month: string;
  expected_income: number;
  savings_target: number;
  needs_pct: number;
  wants_pct: number;
  savings_pct: number;
  notes: string | null;
}

export interface SavingsGoal {
  id: string;
  group_id: string;
  name: string;
  emoji: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  color: string;
  completed: boolean;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface WeeklyIncomeStatus {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  income_total: number;
  status: 'registered' | 'no_income' | 'exempt' | 'missing';
}

export interface BankConnection {
  id: string;
  institution: string | null;
  status: string;
  last_sync_at: string | null;
  user_id: string;
  payment_method_id: string | null;
}
