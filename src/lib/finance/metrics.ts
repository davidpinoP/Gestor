import { addMonths, endOfMonth, monthKey, monthStartFromKey, startOfMonth } from "../dates";
import { LIQUID_TYPES, type Account, type Category, type ISODate, type Scope, type Transaction } from "../types";

export type ScopeFilter = "all" | Scope;

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  amount: number;
  isEssential: boolean;
  scope: Scope | null;
}

export interface PeriodSummary {
  income: number;
  incomePersonal: number;
  incomeBusiness: number;
  incomeRecurring: number;
  incomeExtraordinary: number;
  /** Transferencias de cuentas de negocio a cuentas personales (retribución del socio). */
  ownerDraws: number;
  expense: number;
  expensePersonal: number;
  expenseBusiness: number;
  expenseFixed: number;
  expenseVariable: number;
  expenseExtraordinary: number;
  expenseDiscretionary: number;
  /** Dinero movido a cuentas de inversión (transferencias). */
  invested: number;
  cashFlow: number;
  savingsRate: number | null;
  investmentRate: number | null;
  expenseRatio: number | null;
  byCategory: CategoryTotal[];
  byBusiness: Array<{ businessId: string; income: number; expense: number; profit: number }>;
  pendingExpense: number;
  pendingIncome: number;
  count: number;
}

export interface MetricsContext {
  accounts: Pick<Account, "id" | "scope" | "type" | "purpose">[];
  categories: Pick<Category, "id" | "name" | "parent_id" | "is_essential" | "scope">[];
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function rootCategory(ctx: MetricsContext, id: string | null) {
  if (!id) return null;
  const c = ctx.categories.find((x) => x.id === id);
  if (!c) return null;
  return c.parent_id ? ctx.categories.find((x) => x.id === c.parent_id) ?? c : c;
}

/**
 * Resumen de un periodo [from, to] (ambos incluidos).
 * - Sólo movimientos pagados cuentan como realizados.
 * - Las transferencias nunca son ingreso ni gasto en la vista consolidada.
 * - En la vista "personal", lo que el socio se transfiere desde el negocio cuenta como ingreso personal.
 */
export function summarize(txs: Transaction[], ctx: MetricsContext, from: ISODate, to: ISODate, scope: ScopeFilter = "all"): PeriodSummary {
  const acc = new Map(ctx.accounts.map((a) => [a.id, a]));
  const s: PeriodSummary = {
    income: 0, incomePersonal: 0, incomeBusiness: 0, incomeRecurring: 0, incomeExtraordinary: 0, ownerDraws: 0,
    expense: 0, expensePersonal: 0, expenseBusiness: 0, expenseFixed: 0, expenseVariable: 0, expenseExtraordinary: 0,
    expenseDiscretionary: 0, invested: 0, cashFlow: 0, savingsRate: null, investmentRate: null, expenseRatio: null,
    byCategory: [], byBusiness: [], pendingExpense: 0, pendingIncome: 0, count: 0,
  };
  const cats = new Map<string, CategoryTotal>();
  const biz = new Map<string, { businessId: string; income: number; expense: number; profit: number }>();
  const inScope = (sc: Scope) => scope === "all" || scope === sc;

  for (const t of txs) {
    if (t.date < from || t.date > to) continue;
    if (t.status === "pending") {
      if (t.kind === "expense" && inScope(t.scope)) s.pendingExpense += t.amount_cents;
      if (t.kind === "income" && inScope(t.scope)) s.pendingIncome += t.amount_cents;
      continue;
    }
    if (t.kind === "transfer") {
      const fromA = acc.get(t.account_id);
      const toA = t.to_account_id ? acc.get(t.to_account_id) : undefined;
      if (!fromA || !toA) continue;
      const toInvestment = toA.type === "investment" || toA.purpose === "investment";
      const fromInvestment = fromA.type === "investment" || fromA.purpose === "investment";
      if (toInvestment && !fromInvestment && (scope === "all" || toA.scope === scope)) s.invested += t.amount_cents;
      if (fromA.scope === "business" && toA.scope === "personal") {
        s.ownerDraws += t.amount_cents;
        if (scope === "personal") { s.income += t.amount_cents; s.incomePersonal += t.amount_cents; s.incomeRecurring += t.is_recurring ? t.amount_cents : 0; }
      }
      continue;
    }
    if (!inScope(t.scope)) continue;
    s.count++;
    const a = t.amount_cents;
    if (t.kind === "income") {
      s.income += a;
      if (t.scope === "business") s.incomeBusiness += a; else s.incomePersonal += a;
      if (t.is_recurring) s.incomeRecurring += a;
      if (t.is_extraordinary) s.incomeExtraordinary += a;
    } else {
      s.expense += a;
      if (t.scope === "business") s.expenseBusiness += a; else s.expensePersonal += a;
      if (t.is_extraordinary) s.expenseExtraordinary += a;
      else if (t.is_recurring) s.expenseFixed += a;
      else s.expenseVariable += a;
      const root = rootCategory(ctx, t.category_id);
      if (root && !root.is_essential) s.expenseDiscretionary += a;
      const key = root?.id ?? "none";
      const cur = cats.get(key) ?? { categoryId: root?.id ?? null, name: root?.name ?? "Sin categoría", amount: 0, isEssential: root?.is_essential ?? true, scope: root?.scope ?? null };
      cur.amount += a;
      cats.set(key, cur);
    }
    if (t.business_id) {
      const b = biz.get(t.business_id) ?? { businessId: t.business_id, income: 0, expense: 0, profit: 0 };
      if (t.kind === "income") b.income += a; else b.expense += a;
      b.profit = b.income - b.expense;
      biz.set(t.business_id, b);
    }
  }
  s.cashFlow = s.income - s.expense;
  s.savingsRate = ratio(s.cashFlow, s.income);
  s.investmentRate = ratio(s.invested, s.income);
  s.expenseRatio = ratio(s.expense, s.income);
  s.byCategory = [...cats.values()].sort((x, y) => y.amount - x.amount);
  s.byBusiness = [...biz.values()].sort((x, y) => y.profit - x.profit);
  return s;
}

export const summarizeMonth = (txs: Transaction[], ctx: MetricsContext, key: string, scope: ScopeFilter = "all") =>
  summarize(txs, ctx, monthStartFromKey(key), endOfMonth(monthStartFromKey(key)), scope);

/** Claves de los `n` meses completos anteriores al mes de `today`. */
export function previousFullMonths(today: ISODate, n: number): string[] {
  const out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(monthKey(addMonths(startOfMonth(today), -i)));
  return out;
}

/** Media mensual de gasto e ingreso de los últimos `n` meses completos (sólo meses con actividad). */
export function monthlyAverages(txs: Transaction[], ctx: MetricsContext, today: ISODate, n = 3, scope: ScopeFilter = "all") {
  const months = previousFullMonths(today, n).map((k) => summarizeMonth(txs, ctx, k, scope));
  const active = months.filter((m) => m.count > 0 || m.ownerDraws > 0);
  if (active.length === 0) return { expense: null as number | null, income: null as number | null, months: 0 };
  const avg = (f: (m: PeriodSummary) => number) => Math.round(active.reduce((s, m) => s + f(m), 0) / active.length);
  return { expense: avg((m) => m.expense), income: avg((m) => m.income), months: active.length };
}

/** Meses de supervivencia con la liquidez (sin reservas fiscales) al ritmo medio de gasto. */
export function runwayMonths(liquidExTax: number, avgMonthlyExpense: number | null): number | null {
  if (avgMonthlyExpense === null || avgMonthlyExpense <= 0) return null;
  return Math.max(0, liquidExTax) / avgMonthlyExpense;
}

export interface CategoryDeviation {
  categoryId: string;
  name: string;
  isEssential: boolean;
  current: number;
  baseline: number;
  excess: number;
  annualizedImpact: number;
  comparableDays: number;
  monthsCompared: number;
}

/**
 * Compara el gasto por categoría del mes actual (hasta hoy) con la media de los 3 meses
 * anteriores en el MISMO tramo de días (1..día de hoy), para que el periodo sea comparable.
 */
export function categoryDeviations(txs: Transaction[], ctx: MetricsContext, today: ISODate, scope: ScopeFilter = "all", minExcessCents = 2000): CategoryDeviation[] {
  const day = Number(today.slice(8, 10));
  const current = summarize(txs, ctx, startOfMonth(today), today, scope);
  const prev = previousFullMonths(today, 3).map((k) => {
    const start = monthStartFromKey(k);
    const lastDay = Number(endOfMonth(start).slice(8, 10));
    const to = `${k}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    return summarize(txs, ctx, start, to, scope);
  });
  const activePrev = prev.filter((m) => m.count > 0);
  if (activePrev.length === 0) return [];
  const out: CategoryDeviation[] = [];
  for (const c of current.byCategory) {
    if (!c.categoryId) continue;
    const baseline = Math.round(activePrev.reduce((s, m) => s + (m.byCategory.find((x) => x.categoryId === c.categoryId)?.amount ?? 0), 0) / activePrev.length);
    const excess = c.amount - baseline;
    if (excess >= minExcessCents && (baseline === 0 || excess / baseline >= 0.15)) {
      out.push({ categoryId: c.categoryId, name: c.name, isEssential: c.isEssential, current: c.amount, baseline, excess, annualizedImpact: excess * 12, comparableDays: day, monthsCompared: activePrev.length });
    }
  }
  return out.sort((a, b) => b.excess - a.excess);
}

export function liquidAccounts<T extends Pick<Account, "type">>(accounts: T[]) {
  return accounts.filter((a) => LIQUID_TYPES.includes(a.type));
}
