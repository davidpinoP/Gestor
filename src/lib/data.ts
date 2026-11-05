import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, startOfMonth, todayMadrid } from "./dates";
import type { AccountWithBalance, Business, Category, ISODate, PlannedItem, Profile, Transaction, Account } from "./types";

const PAGE = 1000; // límite por petición de PostgREST

/** Descarga todas las filas paginando (Supabase devuelve como máximo 1000 por petición). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const TX_COLUMNS =
  "id,kind,status,date,amount_cents,account_id,to_account_id,category_id,scope,business_id,payment_method,description,tags,is_recurring,is_extraordinary,tax_deductible,planned_item_id,source,created_at";

export async function loadProfile(sb: SupabaseClient): Promise<Profile> {
  const { data, error } = await sb.from("profiles").select("*").single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function loadReference(sb: SupabaseClient) {
  const [biz, accs, bals, cats] = await Promise.all([
    sb.from("businesses").select("id,name,color,is_active").order("name"),
    sb.from("accounts").select("*").order("sort_order").order("created_at"),
    sb.from("account_balances").select("account_id,balance_cents"),
    sb.from("categories").select("id,scope,kind,name,parent_id,is_essential,archived,sort_order").order("sort_order").order("name"),
  ]);
  for (const r of [biz, accs, bals, cats]) if (r.error) throw new Error(r.error.message);
  const balance = new Map((bals.data ?? []).map((b) => [b.account_id as string, Number(b.balance_cents)]));
  const accounts: AccountWithBalance[] = (accs.data as Account[]).map((a) => ({
    ...a,
    opening_balance_cents: Number(a.opening_balance_cents),
    balance_cents: balance.get(a.id) ?? Number(a.opening_balance_cents),
  }));
  return { businesses: biz.data as Business[], accounts, categories: cats.data as Category[] };
}

const normTx = (t: Transaction): Transaction => ({ ...t, amount_cents: Number(t.amount_cents) });
const normPlanned = (p: PlannedItem): PlannedItem => ({ ...p, amount_cents: Number(p.amount_cents) });

export async function loadTransactions(sb: SupabaseClient, from: ISODate, to?: ISODate): Promise<Transaction[]> {
  const rows = await fetchAll<Transaction>((a, b) => {
    let q = sb.from("transactions").select(TX_COLUMNS).is("deleted_at", null).gte("date", from);
    if (to) q = q.lte("date", to);
    return q.order("date", { ascending: false }).order("created_at", { ascending: false }).range(a, b);
  });
  return rows.map(normTx);
}

export async function loadPendingTransactions(sb: SupabaseClient): Promise<Transaction[]> {
  const rows = await fetchAll<Transaction>((a, b) =>
    sb.from("transactions").select(TX_COLUMNS).is("deleted_at", null).eq("status", "pending").order("date").range(a, b),
  );
  return rows.map(normTx);
}

export async function loadPlanned(sb: SupabaseClient, opts: { activeOnly?: boolean } = {}): Promise<PlannedItem[]> {
  const rows = await fetchAll<PlannedItem>((a, b) => {
    let q = sb.from("planned_items").select("*").is("deleted_at", null);
    if (opts.activeOnly) q = q.in("status", ["planned", "reserved"]);
    return q.order("expected_date").range(a, b);
  });
  return rows.map(normPlanned);
}

/** Todo lo necesario para el dashboard: 13 meses de movimientos + previsiones activas. */
export async function loadDashboardData(sb: SupabaseClient) {
  const today = todayMadrid();
  const from = addMonths(startOfMonth(today), -12);
  const [profile, ref, txs, pending, planned] = await Promise.all([
    loadProfile(sb),
    loadReference(sb),
    loadTransactions(sb, from),
    loadPendingTransactions(sb),
    loadPlanned(sb, { activeOnly: true }),
  ]);
  return { today, profile, ...ref, txs, pending, planned };
}
