import { describe, expect, it } from "vitest";
import { parseAmountToCents, formatEUR, centsToInput } from "./money";
import { addMonths, todayMadrid, startOfWeek, endOfMonth } from "./dates";
import { computePosition } from "./finance/position";
import { netWorthHistory } from "./finance/history";
import { summarizeMonth, categoryDeviations, monthlyAverages, runwayMonths } from "./finance/metrics";
import { expandPlanned, reservePlan, projectLiquidity, detectClusters } from "./finance/planning";
import { computeNextMove } from "./finance/next-move";
import { parseNaturalLanguage } from "./nl-parser";
import type { AccountWithBalance, Category, PlannedItem, Transaction, Business } from "./types";

const acc = (o: Partial<AccountWithBalance>): AccountWithBalance => ({
  id: "a", name: "Banco", type: "checking", purpose: "operating", scope: "personal", business_id: null, institution: null,
  opening_balance_cents: 0, opening_date: "2026-01-01", include_in_net_worth: true, archived: false, sort_order: 0, balance_cents: 0, ...o,
});
let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, kind: "expense", status: "paid", date: "2026-10-10", amount_cents: 1000, account_id: "a", to_account_id: null, category_id: null,
  scope: "personal", business_id: null, payment_method: null, description: null, tags: [], is_recurring: false, is_extraordinary: false,
  tax_deductible: "no", planned_item_id: null, source: "manual", ...o,
});
const plan = (o: Partial<PlannedItem>): PlannedItem => ({
  id: `p${n++}`, kind: "expense", name: "Seguro", amount_cents: 60000, expected_date: "2026-11-20", due_date: null, category_id: null, scope: "personal",
  business_id: null, account_id: null, priority: "medium", status: "planned", is_mandatory: true, certainty: "estimated", recurrence: "none",
  recurrence_end: null, notes: null, paid_transaction_id: null, ...o,
});
const cat = (o: Partial<Category>): Category => ({ id: "c", scope: "personal", kind: "expense", name: "X", parent_id: null, is_essential: true, archived: false, sort_order: 0, ...o });

describe("money", () => {
  it("parsea formatos españoles e internacionales", () => {
    expect(parseAmountToCents("45")).toBe(4500);
    expect(parseAmountToCents("45,5")).toBe(4550);
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("1.234")).toBe(123400);
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents("45 €")).toBe(4500);
    expect(parseAmountToCents("0,1")).toBe(10);
    expect(parseAmountToCents("0.1")).toBe(10);
  });
  it("rechaza importes inválidos", () => {
    for (const v of ["", "abc", "-5", "0", "1,234,5", "12.345.6", "1e5"]) expect(parseAmountToCents(v)).toBeNull();
  });
  it("evita errores de coma flotante", () => {
    expect(parseAmountToCents(0.1 + 0.2)).toBe(30);
    expect(centsToInput(123456)).toBe("1234,56");
    expect(formatEUR(123456).replace(/\s/g, " ")).toMatch(/1\.?234,56/);
  });
});

describe("dates", () => {
  it("usa la fecha de Madrid", () => {
    expect(todayMadrid(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29"); // CET+1
    expect(todayMadrid(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02"); // CEST+2
  });
  it("suma meses respetando fin de mes", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(startOfWeek("2026-11-05")).toBe("2026-11-02");
  });
});

describe("posición y patrimonio", () => {
  const accounts = [
    acc({ id: "a", balance_cents: 120000 }),
    acc({ id: "r", purpose: "reserve", type: "savings", balance_cents: 30000 }),
    acc({ id: "e", purpose: "emergency", type: "savings", balance_cents: 50000 }),
    acc({ id: "i", type: "investment", purpose: "investment", balance_cents: 200000 }),
    acc({ id: "l", type: "loan", purpose: "debt", balance_cents: -400000 }),
    acc({ id: "k", scope: "business", business_id: "kyz", balance_cents: 80000 }),
  ];
  it("calcula patrimonio = activos − pasivos sin duplicar", () => {
    const p = computePosition(accounts, [], [], { min_liquidity_buffer_cents: 10000 }, "2026-11-05");
    expect(p.assets).toBe(480000);
    expect(p.liabilities).toBe(400000);
    expect(p.netWorth).toBe(80000);
    expect(p.netWorthBusiness).toBe(80000);
    expect(p.available).toBe(200000);
    expect(p.reserved).toBe(80000);
    expect(p.invested).toBe(200000);
  });
  it("resta lo comprometido (no lo ya reservado) y el colchón", () => {
    const planned = [plan({ amount_cents: 85000, expected_date: "2026-11-20" }), plan({ amount_cents: 99999, status: "reserved" }), plan({ amount_cents: 5000, expected_date: "2027-03-01" })];
    const pending = [tx({ status: "pending", amount_cents: 1000, date: "2026-11-10" })];
    const p = computePosition(accounts, planned, pending, { min_liquidity_buffer_cents: 10000 }, "2026-11-05");
    expect(p.committed).toBe(86000);
    expect(p.freeToUse).toBe(200000 - 86000 - 10000);
  });
  it("reconstruye el histórico mensual desde los saldos actuales", () => {
    const a = [acc({ id: "a", balance_cents: 100000, opening_date: "2026-09-01" })];
    const txs = [tx({ date: "2026-10-15", amount_cents: 20000, kind: "income" }), tx({ date: "2026-11-02", amount_cents: 5000 })];
    const h = netWorthHistory(a, txs, ["2026-08", "2026-09", "2026-10", "2026-11"], "2026-11-05");
    expect(h.map((x) => x.netWorth)).toEqual([0, 85000, 105000, 100000]);
    expect(h.map((x) => x.accountsOpen)).toEqual([0, 1, 1, 1]);
  });
});

describe("métricas", () => {
  const categories = [cat({ id: "rest", name: "Restaurantes", is_essential: false }), cat({ id: "food", name: "Alimentación" }), cat({ id: "sup", name: "Supermercado", parent_id: "food" })];
  const accounts = [acc({ id: "a" }), acc({ id: "i", type: "investment", purpose: "investment" }), acc({ id: "k", scope: "business", business_id: "kyz" })];
  const ctx = { accounts, categories };
  it("separa tipos de ingreso/gasto y excluye transferencias", () => {
    const txs = [
      tx({ kind: "income", amount_cents: 300000, is_recurring: true }),
      tx({ amount_cents: 50000, is_recurring: true, category_id: "sup" }),
      tx({ amount_cents: 20000, category_id: "rest" }),
      tx({ amount_cents: 10000, is_extraordinary: true }),
      tx({ kind: "transfer", account_id: "a", to_account_id: "i", amount_cents: 40000 }),
      tx({ kind: "transfer", account_id: "k", to_account_id: "a", amount_cents: 100000 }),
      tx({ kind: "income", scope: "business", business_id: "kyz", account_id: "k", amount_cents: 70000 }),
      tx({ status: "pending", amount_cents: 99900 }),
    ];
    const s = summarizeMonth(txs, ctx, "2026-10");
    expect(s.income).toBe(370000);
    expect(s.expense).toBe(80000);
    expect(s.expenseFixed).toBe(50000);
    expect(s.expenseVariable).toBe(20000);
    expect(s.expenseExtraordinary).toBe(10000);
    expect(s.expenseDiscretionary).toBe(20000);
    expect(s.invested).toBe(40000);
    expect(s.ownerDraws).toBe(100000);
    expect(s.pendingExpense).toBe(99900);
    expect(s.byCategory[0]).toMatchObject({ name: "Alimentación", amount: 50000 });
    expect(s.byBusiness[0]).toMatchObject({ businessId: "kyz", profit: 70000 });
    const personal = summarizeMonth(txs, ctx, "2026-10", "personal");
    expect(personal.income).toBe(400000); // nómina + retribución del negocio
  });
  it("detecta desviaciones en periodos comparables", () => {
    const txs = [
      tx({ date: "2026-08-03", amount_cents: 21000, category_id: "rest" }),
      tx({ date: "2026-08-25", amount_cents: 50000, category_id: "rest" }), // fuera del tramo comparable
      tx({ date: "2026-09-04", amount_cents: 21000, category_id: "rest" }),
      tx({ date: "2026-10-01", amount_cents: 21000, category_id: "rest" }),
      tx({ date: "2026-11-02", amount_cents: 32000, category_id: "rest" }),
    ];
    const d = categoryDeviations(txs, ctx, "2026-11-05");
    expect(d[0]).toMatchObject({ name: "Restaurantes", current: 32000, baseline: 21000, excess: 11000, annualizedImpact: 132000 });
  });
  it("calcula medias y runway", () => {
    const txs = [tx({ date: "2026-08-03", amount_cents: 100000 }), tx({ date: "2026-10-03", amount_cents: 200000 })];
    const avg = monthlyAverages(txs, ctx, "2026-11-05");
    expect(avg.expense).toBe(150000);
    expect(runwayMonths(450000, avg.expense)).toBe(3);
  });
});

describe("planificación", () => {
  it("expande recurrencias y respeta la fecha fin", () => {
    const occ = expandPlanned([plan({ expected_date: "2026-01-31", recurrence: "monthly", recurrence_end: "2026-04-30" })], "2026-01-01", "2026-12-31");
    expect(occ.map((o) => o.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occ[1].virtual).toBe(true);
  });
  it("reparte la reserva existente y calcula aportación semanal", () => {
    const occ = expandPlanned([plan({ amount_cents: 60000, expected_date: "2026-11-19" }), plan({ amount_cents: 120000, expected_date: "2027-04-30" })], "2026-11-05", "2027-12-31");
    const r = reservePlan(occ, 20000, "2026-11-05");
    expect(r.lines[0]).toMatchObject({ covered: 20000, remaining: 40000, weeksLeft: 2, perWeek: 20000 });
    expect(r.lines[1].covered).toBe(0);
    expect(r.totalRemaining).toBe(160000);
  });
  it("proyecta liquidez y detecta el primer día negativo", () => {
    const occ = expandPlanned([plan({ amount_cents: 85000, expected_date: "2026-11-10" }), plan({ kind: "income", amount_cents: 50000, expected_date: "2026-11-15" })], "2026-11-05", "2027-01-01");
    const pr = projectLiquidity(80000, occ, "2026-11-05", 30, 10000);
    expect(pr.firstNegative).toBe("2026-11-10");
    expect(pr.min.balance).toBe(-5000);
    expect(pr.end).toBe(45000);
  });
  it("detecta semanas con pagos concentrados", () => {
    const occ = expandPlanned([plan({ expected_date: "2026-11-16", amount_cents: 30000 }), plan({ expected_date: "2026-11-18", amount_cents: 30000 }), plan({ expected_date: "2026-12-20", amount_cents: 1000 })], "2026-11-05", "2027-03-01");
    const c = detectClusters(occ, 200000, "2026-11-05");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ weekStart: "2026-11-16", total: 60000, count: 2 });
  });
});

describe("next move", () => {
  const base = computePosition([acc({ balance_cents: 120000 })], [plan({ amount_cents: 85000, expected_date: "2026-11-20" })], [], { min_liquidity_buffer_cents: 0 }, "2026-11-05");
  it("prioriza reservar cuando los pagos próximos comprometen la liquidez", () => {
    const m = computeNextMove({
      today: "2026-11-05", position: base, projection: { min: { date: "2026-11-20", balance: 35000 }, firstNegative: null, firstBelowBuffer: null },
      projectionDays: 90, occurrences: [], avgMonthlyExpense: null, avgMonthlyPersonalExpense: null, emergencyMonthsTarget: 6, deviations: [], hasAccounts: true, hasTransactions: true,
    });
    expect(m.code).toBe("reserve_commitments");
    expect(m.body).toContain("850");
  });
  it("alerta de liquidez negativa por encima de todo salvo vencidos", () => {
    const m = computeNextMove({
      today: "2026-11-05", position: base, projection: { min: { date: "2026-11-20", balance: -5000 }, firstNegative: "2026-11-20", firstBelowBuffer: "2026-11-20" },
      projectionDays: 90, occurrences: [], avgMonthlyExpense: null, avgMonthlyPersonalExpense: null, emergencyMonthsTarget: 6, deviations: [], hasAccounts: true, hasTransactions: true,
    });
    expect(m.code).toBe("liquidity_negative");
  });
});

describe("lenguaje natural", () => {
  const categories = [
    cat({ id: "trans", name: "Transporte" }), cat({ id: "comb", name: "Combustible", parent_id: "trans" }),
    cat({ id: "vc", name: "Viajes comerciales", scope: "business" }), cat({ id: "pub", name: "Publicidad", scope: "business" }),
    cat({ id: "ventas", name: "Ventas", scope: "business", kind: "income" }), cat({ id: "rest", name: "Restaurantes" }),
  ];
  const businesses: Business[] = [{ id: "kyz", name: "KYZ", color: "#fff", is_active: true }];
  const accounts = [acc({ id: "a", name: "BBVA" }), acc({ id: "cash", name: "Efectivo", type: "cash" }), acc({ id: "k", name: "Cuenta KYZ", scope: "business", business_id: "kyz" })];
  const ctx = { categories, businesses, accounts, today: "2026-11-05" };
  it("interpreta el ejemplo de gasolina para KYZ", () => {
    const d = parseNaturalLanguage("He gastado 45 € en gasolina para KYZ", ctx);
    expect(d).toMatchObject({ kind: "expense", amount_cents: 4500, scope: "business", business_id: "kyz", category_id: "vc", account_id: "k", date: "2026-11-05" });
  });
  it("interpreta ingresos, fechas y métodos de pago", () => {
    const d = parseNaturalLanguage("Ayer cobré 1.250,50 euros de ventas KYZ por transferencia", ctx);
    expect(d).toMatchObject({ kind: "income", amount_cents: 125050, date: "2026-11-04", category_id: "ventas", payment_method: "transfer" });
    const e = parseNaturalLanguage("cena restaurante 32,40 en efectivo el 2 de noviembre", ctx);
    expect(e).toMatchObject({ kind: "expense", amount_cents: 3240, category_id: "rest", account_id: "cash", date: "2026-11-02", scope: "personal" });
    const f = parseNaturalLanguage("gasolina 60 el lunes", ctx);
    expect(f).toMatchObject({ category_id: "comb", date: "2026-11-02", amount_cents: 6000 });
  });
});
