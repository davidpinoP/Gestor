// Tipos de dominio. Reflejan supabase/migrations/0001_core.sql.
export type Scope = "personal" | "business";
export type TxKind = "income" | "expense" | "transfer";
export type FlowKind = "income" | "expense";
export type TxStatus = "paid" | "pending";
export type Deductible = "no" | "yes" | "pending_validation";
export type AccountType =
  | "checking" | "savings" | "cash" | "investment"
  | "credit_card" | "loan" | "other_asset" | "other_liability";
export type AccountPurpose = "operating" | "reserve" | "emergency" | "tax" | "investment" | "debt";
export type PlannedStatus = "planned" | "reserved" | "paid" | "cancelled";
export type Priority = "high" | "medium" | "low";
export type Certainty = "exact" | "estimated" | "approximate";
export type Recurrence = "none" | "weekly" | "monthly" | "quarterly" | "yearly";
export type PaymentMethod = "card" | "transfer" | "cash" | "direct_debit" | "bizum" | "paypal" | "other";
export type TxSource = "manual" | "natural_language" | "planned" | "import" | "bank";

/** Fecha de calendario sin hora, formato YYYY-MM-DD (Europe/Madrid). */
export type ISODate = string;

export interface Profile {
  id: string;
  display_name: string | null;
  currency: string;
  timezone: string;
  min_liquidity_buffer_cents: number;
  emergency_fund_months: number;
  monthly_income_target_cents: number;
}

export interface Business {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  purpose: AccountPurpose;
  scope: Scope;
  business_id: string | null;
  institution: string | null;
  opening_balance_cents: number;
  opening_date: ISODate;
  include_in_net_worth: boolean;
  archived: boolean;
  sort_order: number;
}

export interface AccountWithBalance extends Account {
  balance_cents: number;
}

export interface Category {
  id: string;
  scope: Scope;
  kind: FlowKind;
  name: string;
  parent_id: string | null;
  is_essential: boolean;
  archived: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  kind: TxKind;
  status: TxStatus;
  date: ISODate;
  amount_cents: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  scope: Scope;
  business_id: string | null;
  payment_method: PaymentMethod | null;
  description: string | null;
  tags: string[];
  is_recurring: boolean;
  is_extraordinary: boolean;
  tax_deductible: Deductible;
  planned_item_id: string | null;
  source: TxSource;
  created_at?: string;
}

export interface PlannedItem {
  id: string;
  kind: FlowKind;
  name: string;
  amount_cents: number;
  expected_date: ISODate;
  due_date: ISODate | null;
  category_id: string | null;
  scope: Scope;
  business_id: string | null;
  account_id: string | null;
  priority: Priority;
  status: PlannedStatus;
  is_mandatory: boolean;
  certainty: Certainty;
  recurrence: Recurrence;
  recurrence_end: ISODate | null;
  notes: string | null;
  paid_transaction_id: string | null;
}

export const LIABILITY_TYPES: AccountType[] = ["credit_card", "loan", "other_liability"];
export const LIQUID_TYPES: AccountType[] = ["checking", "savings", "cash"];

export const isLiability = (t: AccountType) => LIABILITY_TYPES.includes(t);
