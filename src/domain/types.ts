export type ISODate = string; // 'YYYY-MM-DD'
export type YearMonth = string; // 'YYYY-MM'
export type TxnKind = 'expense' | 'income' | 'transfer_out' | 'transfer_in';

export interface Txn {
  id: string;
  account_id: string;
  kind: TxnKind;
  amount_minor: number;
  currency: string;
  amount_huf_minor: number;
  category_id: string | null;
  date: ISODate;
  note?: string;
  source: 'manual' | 'sms' | 'recurring';
  needs_review: boolean;
  recurring_rule_id: string | null;
  transfer_pair_id: string | null;
  sms_message_id?: string | null;
  /** Server creation timestamp; read-only, used only as a sort tiebreak. */
  created_date?: string;
}

export interface RecurringRule {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  amount_minor: number;
  currency: string;
  amount_huf_minor: number;
  category_id: string | null;
  account_id: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  start_date: ISODate;
  end_date: ISODate | null;
  last_materialized_date: ISODate | null;
  active: boolean;
}

export interface MonthOverride { savings_target_minor?: number; category_budgets?: Record<string, number> }

export interface Settings {
  base_currency: 'HUF';
  monthly_savings_target_minor: number;
  monthly_investment_amount_minor: number | null;
  emergency_fund_months: number;
  week_start: 'monday';
  digest_time: string;
  timezone: string;
  month_overrides: Record<YearMonth, MonthOverride>;
  has_expensive_debt: boolean | null;
}

export interface MonthClose {
  id: string;
  month: YearMonth;
  final_remaining_minor: number;
  deficit_minor: number;
  leftover_action: 'transferred' | 'kept' | 'none';
  transfer_pair_id: string | null;
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'investment';
  currency: string;
  opening_balance_minor: number;
  is_default: boolean;
  is_savings_target: boolean;
  archived: boolean;
  sms_sender: string | null;
}

export type PlanStatus = 'considering' | 'decided' | 'bought' | 'dropped';

export interface PurchasePlan {
  id: string;
  title: string;
  needed_by: ISODate | null;
  status: PlanStatus;
  selected_option_id: string | null;
  planned_month: YearMonth | null;
  transaction_id: string | null;
  recurring_rule_id: string | null;
  advice: StoredAdvice | null;
}

export interface PurchaseOption {
  id: string;
  plan_id: string;
  name: string;
  price_minor: number;
  currency: 'HUF';
  payment: 'one_time' | 'installments';
  installment_minor: number | null;
  installment_count: number | null;
  link: string | null;
  note: string | null;
  position: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  kind: 'emergency' | 'custom';
  target_minor: number | null;
  account_id: string;
  priority: number;
  icon: string;
}

export type AdviceChange =
  | { type: 'category_budget'; category_id: string; category_name: string; from_minor: number | null; to_minor: number }
  | { type: 'savings_target'; from_minor: number; to_minor: number }
  | { type: 'postpone'; month: YearMonth };

export interface Advice { option_index: number; month: YearMonth; summary: string; others: string; changes: AdviceChange[] }
export interface StoredAdvice { fingerprint: string; generated_at: string; advice: Advice }
export interface GuideCache { key: string; intro: string; tips: Record<number, string>; generated_at: string }
