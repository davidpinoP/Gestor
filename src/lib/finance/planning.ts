import { addDays, addMonths, daysBetween, startOfWeek } from "../dates";
import type { ISODate, PlannedItem, Recurrence, Transaction } from "../types";

export function nextOccurrence(date: ISODate, rec: Recurrence, anchorDay?: number): ISODate | null {
  switch (rec) {
    case "weekly": return addDays(date, 7);
    case "monthly": return addMonths(date, 1, anchorDay);
    case "quarterly": return addMonths(date, 3, anchorDay);
    case "yearly": return addMonths(date, 12, anchorDay);
    default: return null;
  }
}

export interface Occurrence {
  itemId: string;
  name: string;
  kind: "income" | "expense";
  date: ISODate;
  dueDate: ISODate | null;
  amount: number;
  status: PlannedItem["status"];
  priority: PlannedItem["priority"];
  isMandatory: boolean;
  certainty: PlannedItem["certainty"];
  businessId: string | null;
  /** true = repetición futura calculada, todavía no existe como fila. */
  virtual: boolean;
  source: "planned" | "pending_tx";
}

/** Expande previsiones activas (y sus repeticiones) dentro de [from, to]. */
export function expandPlanned(items: PlannedItem[], from: ISODate, to: ISODate): Occurrence[] {
  const out: Occurrence[] = [];
  for (const p of items) {
    if (p.status === "paid" || p.status === "cancelled") continue;
    const anchor = Number(p.expected_date.slice(8, 10));
    let date: ISODate | null = p.expected_date;
    let due = p.due_date;
    let virtual = false;
    let guard = 0;
    while (date && date <= to && guard++ < 600) {
      if (p.recurrence_end && date > p.recurrence_end) break;
      // Las vencidas no pagadas siempre se muestran (siguen siendo obligaciones).
      if (date >= from || !virtual) {
        out.push({
          itemId: p.id, name: p.name, kind: p.kind, date, dueDate: due, amount: p.amount_cents,
          status: virtual ? "planned" : p.status, priority: p.priority, isMandatory: p.is_mandatory,
          certainty: p.certainty, businessId: p.business_id, virtual, source: "planned",
        });
      }
      const nd = nextOccurrence(date, p.recurrence, anchor);
      if (!nd) break;
      if (due) due = addDays(due, daysBetween(date, nd));
      date = nd;
      virtual = true;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function pendingTxOccurrences(txs: Transaction[]): Occurrence[] {
  return txs
    .filter((t) => t.status === "pending" && t.kind !== "transfer")
    .map((t) => ({
      itemId: t.id, name: t.description || (t.kind === "income" ? "Cobro pendiente" : "Pago pendiente"),
      kind: t.kind as "income" | "expense", date: t.date, dueDate: null, amount: t.amount_cents, status: "planned" as const,
      priority: "medium" as const, isMandatory: true, certainty: "exact" as const, businessId: t.business_id, virtual: false, source: "pending_tx" as const,
    }));
}

export interface ReserveLine {
  itemId: string;
  name: string;
  date: ISODate;
  amount: number;
  covered: number; // cubierto por saldo ya reservado
  remaining: number;
  weeksLeft: number;
  perWeek: number;
  perMonth: number;
}

/**
 * Plan de reserva: reparte el saldo ya apartado (cuentas de reserva) entre los próximos
 * gastos por orden de fecha, y calcula cuánto apartar por semana/mes para cubrir el resto.
 */
export function reservePlan(occ: Occurrence[], reservedBalance: number, today: ISODate, horizonDays = 365) {
  const limit = addDays(today, horizonDays);
  let pool = Math.max(0, reservedBalance);
  const lines: ReserveLine[] = [];
  for (const o of occ) {
    if (o.kind !== "expense" || o.date > limit) continue;
    const covered = Math.min(pool, o.amount);
    pool -= covered;
    const remaining = o.amount - covered;
    const days = Math.max(0, daysBetween(today, o.date));
    const weeksLeft = Math.max(1, Math.ceil(days / 7));
    const monthsLeft = Math.max(1, Math.ceil(days / 30.4375));
    lines.push({
      itemId: o.itemId, name: o.name, date: o.date, amount: o.amount, covered, remaining, weeksLeft,
      perWeek: Math.ceil(remaining / weeksLeft), perMonth: Math.ceil(remaining / monthsLeft),
    });
  }
  return {
    lines,
    totalUpcoming: lines.reduce((s, l) => s + l.amount, 0),
    totalCovered: lines.reduce((s, l) => s + l.covered, 0),
    totalRemaining: lines.reduce((s, l) => s + l.remaining, 0),
    weeklyTotal: lines.reduce((s, l) => s + l.perWeek, 0),
    monthlyTotal: lines.reduce((s, l) => s + l.perMonth, 0),
    unallocatedReserve: pool,
  };
}

export interface ProjectionPoint { date: ISODate; balance: number; inflow: number; outflow: number }

/**
 * Proyección diaria de la liquidez (disponible + reservas) aplicando previsiones y movimientos
 * pendientes. Lo vencido y no pagado se aplica hoy. No inventa ingresos: sólo usa los previstos.
 */
export function projectLiquidity(start: number, occ: Occurrence[], today: ISODate, days: number, buffer: number) {
  const byDay = new Map<string, { inflow: number; outflow: number }>();
  for (const o of occ) {
    const d = o.date < today ? today : o.date;
    const cur = byDay.get(d) ?? { inflow: 0, outflow: 0 };
    if (o.kind === "income") cur.inflow += o.amount; else cur.outflow += o.amount;
    byDay.set(d, cur);
  }
  const points: ProjectionPoint[] = [];
  let bal = start;
  let min = { date: today, balance: start };
  let firstBelowBuffer: ISODate | null = null;
  let firstNegative: ISODate | null = null;
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    const f = byDay.get(d) ?? { inflow: 0, outflow: 0 };
    bal += f.inflow - f.outflow;
    points.push({ date: d, balance: bal, inflow: f.inflow, outflow: f.outflow });
    if (bal < min.balance) min = { date: d, balance: bal };
    if (!firstBelowBuffer && bal < buffer) firstBelowBuffer = d;
    if (!firstNegative && bal < 0) firstNegative = d;
  }
  return { points, min, firstBelowBuffer, firstNegative, end: bal };
}

export interface PaymentCluster {
  weekStart: ISODate;
  total: number;
  count: number;
  items: Occurrence[];
  shareOfLiquidity: number | null;
}

/** Semanas en las que se concentran pagos: ≥ 3 pagos o ≥ 25 % de la liquidez actual. */
export function detectClusters(occ: Occurrence[], liquidity: number, today: ISODate, horizonDays = 120): PaymentCluster[] {
  const limit = addDays(today, horizonDays);
  const weeks = new Map<string, PaymentCluster>();
  for (const o of occ) {
    if (o.kind !== "expense" || o.date > limit) continue;
    const w = startOfWeek(o.date < today ? today : o.date);
    const c = weeks.get(w) ?? { weekStart: w, total: 0, count: 0, items: [], shareOfLiquidity: null };
    c.total += o.amount; c.count++; c.items.push(o);
    weeks.set(w, c);
  }
  return [...weeks.values()]
    .map((c) => ({ ...c, shareOfLiquidity: liquidity > 0 ? c.total / liquidity : null }))
    .filter((c) => c.count >= 3 || (c.shareOfLiquidity !== null ? c.shareOfLiquidity >= 0.25 : c.total > 0))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
