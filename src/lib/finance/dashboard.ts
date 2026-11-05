import { addDays, addMonths, endOfMonth, lastMonthKeys, monthKey, startOfMonth } from "../dates";
import type { AccountWithBalance, Business, Category, ISODate, PlannedItem, Profile, Transaction } from "../types";
import { netWorthHistory } from "./history";
import { categoryDeviations, monthlyAverages, runwayMonths, summarize, summarizeMonth, type ScopeFilter } from "./metrics";
import { computeNextMove } from "./next-move";
import { detectClusters, expandPlanned, pendingTxOccurrences, projectLiquidity } from "./planning";
import { computePosition } from "./position";

export interface DashboardInput {
  today: ISODate;
  profile: Profile;
  accounts: AccountWithBalance[];
  categories: Category[];
  businesses: Business[];
  txs: Transaction[];
  pending: Transaction[];
  planned: PlannedItem[];
}

export const PROJECTION_DAYS = 90;

export function buildDashboard(d: DashboardInput, scope: ScopeFilter) {
  const ctx = { accounts: d.accounts, categories: d.categories };
  const position = computePosition(d.accounts, d.planned, d.pending, d.profile, d.today, 30);

  const curKey = monthKey(d.today);
  const prevKey = monthKey(addMonths(startOfMonth(d.today), -1));
  const month = summarizeMonth(d.txs, ctx, curKey, scope);
  const monthToDate = summarize(d.txs, ctx, startOfMonth(d.today), d.today, scope);
  const prev = summarizeMonth(d.txs, ctx, prevKey, scope);
  // Mismo tramo de días del mes anterior (periodo comparable)
  const prevStart = `${prevKey}-01`;
  const prevLastDay = Number(endOfMonth(prevStart).slice(8, 10));
  const prevToDate = summarize(d.txs, ctx, prevStart, `${prevKey}-${String(Math.min(Number(d.today.slice(8, 10)), prevLastDay)).padStart(2, "0")}`, scope);
  const avg3 = monthlyAverages(d.txs, ctx, d.today, 3, scope);
  const avgAll = monthlyAverages(d.txs, ctx, d.today, 3, "all");
  const avgPersonal = monthlyAverages(d.txs, ctx, d.today, 3, "personal");

  const keys = lastMonthKeys(d.today, 12);
  const fullHistory = netWorthHistory(d.accounts, d.txs, keys, d.today);
  // Los meses previos a la primera cuenta no tienen datos: no se muestran como 0 €.
  const firstIdx = fullHistory.findIndex((h) => h.accountsOpen > 0);
  const history = firstIdx < 0 ? [] : fullHistory.slice(firstIdx);
  const flows = keys.map((k) => {
    const s = summarizeMonth(d.txs, ctx, k, scope);
    return { month: k, income: s.income, expense: s.expense };
  });

  const occ = [...expandPlanned(d.planned, d.today, addDays(d.today, 400)), ...pendingTxOccurrences(d.pending)].sort((a, b) => a.date.localeCompare(b.date));
  const liquidity = position.available + position.reserved;
  const projection = projectLiquidity(liquidity, occ.filter((o) => o.date <= addDays(d.today, PROJECTION_DAYS)), d.today, PROJECTION_DAYS, position.buffer);
  const clusters = detectClusters(occ, liquidity, d.today, PROJECTION_DAYS);

  // Gastos previstos del resto del mes (previsiones + pendientes)
  const eom = endOfMonth(d.today);
  const expectedRestOfMonth = occ.filter((o) => o.kind === "expense" && o.date <= eom && (scope === "all" || (scope === "business") === !!o.businessId)).reduce((s, o) => s + o.amount, 0);

  const deviations = categoryDeviations(d.txs, ctx, d.today, scope);
  const runway = runwayMonths(position.liquidTotal - position.taxReserve, avgAll.expense);

  // Objetivo de ingresos personales (incluye retribución desde el negocio)
  const personalMonth = summarizeMonth(d.txs, ctx, curKey, "personal");
  const target = d.profile.monthly_income_target_cents;
  const personalIncomeAvg = avgPersonal.income;

  const nextMove = computeNextMove({
    today: d.today, position, projection, projectionDays: PROJECTION_DAYS, occurrences: occ,
    avgMonthlyExpense: avgAll.expense, avgMonthlyPersonalExpense: avgPersonal.expense, emergencyMonthsTarget: d.profile.emergency_fund_months,
    deviations, // Sin saldos ni movimientos todavía = cuenta recién creada: lo primero es configurar
    hasAccounts: d.accounts.some((a) => !a.archived && a.balance_cents !== 0) || d.txs.length > 0, hasTransactions: d.txs.length > 0,
  });

  const upcoming = occ.filter((o) => o.date <= addDays(d.today, 30)).slice(0, 8);

  return {
    position, month, monthToDate, prev, prevToDate, avg3, history, flows, projection, clusters, expectedRestOfMonth, deviations, runway,
    goal: { target, currentMonth: personalMonth.income, avg3: personalIncomeAvg, monthsOfData: avgPersonal.months },
    nextMove, upcoming,
  };
}
