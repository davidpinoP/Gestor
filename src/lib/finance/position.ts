import { addDays } from "../dates";
import { LIQUID_TYPES, isLiability, type AccountWithBalance, type ISODate, type PlannedItem, type Profile, type Transaction } from "../types";

export interface Position {
  netWorth: number;
  netWorthPersonal: number;
  netWorthBusiness: number;
  assets: number;
  liabilities: number; // positivo = lo que se debe
  liquidTotal: number; // corriente + ahorro + efectivo
  available: number; // líquido de uso corriente (propósito "operativo")
  availableBusiness: number; // parte de lo disponible que está en cuentas de empresa
  reserved: number; // líquido apartado: reserva, emergencia, impuestos
  emergencyFund: number;
  taxReserve: number;
  invested: number;
  otherAssets: number;
  /** Salidas previstas (no reservadas) en el horizonte, incluidas las vencidas. */
  committed: number;
  committedHorizonDays: number;
  buffer: number;
  /** Disponible − comprometido − colchón mínimo. Puede ser negativo. */
  freeToUse: number;
}

/** Salidas previstas que todavía deben salir del dinero disponible. */
export function upcomingOutflows(
  planned: PlannedItem[],
  pending: Transaction[],
  today: ISODate,
  horizonDays: number,
): { amount: number; items: Array<{ name: string; date: ISODate; amount: number }> } {
  const limit = addDays(today, horizonDays);
  const items: Array<{ name: string; date: ISODate; amount: number }> = [];
  for (const p of planned) {
    // "reserved" ya está apartado en cuentas de reserva: no se descuenta dos veces.
    if (p.kind === "expense" && p.status === "planned" && p.expected_date <= limit) {
      items.push({ name: p.name, date: p.expected_date, amount: p.amount_cents });
    }
  }
  for (const t of pending) {
    if (t.kind === "expense" && t.status === "pending" && t.date <= limit) {
      items.push({ name: t.description || "Gasto pendiente", date: t.date, amount: t.amount_cents });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { amount: items.reduce((s, i) => s + i.amount, 0), items };
}

export function computePosition(
  accounts: AccountWithBalance[],
  planned: PlannedItem[],
  pending: Transaction[],
  profile: Pick<Profile, "min_liquidity_buffer_cents">,
  today: ISODate,
  horizonDays = 30,
): Position {
  const p: Position = {
    netWorth: 0, netWorthPersonal: 0, netWorthBusiness: 0, assets: 0, liabilities: 0,
    liquidTotal: 0, available: 0, availableBusiness: 0, reserved: 0, emergencyFund: 0, taxReserve: 0, invested: 0, otherAssets: 0,
    committed: 0, committedHorizonDays: horizonDays, buffer: profile.min_liquidity_buffer_cents, freeToUse: 0,
  };
  for (const a of accounts) {
    if (a.archived && a.balance_cents === 0) continue;
    const b = a.balance_cents;
    if (a.include_in_net_worth) {
      p.netWorth += b;
      if (a.scope === "business") p.netWorthBusiness += b;
      else p.netWorthPersonal += b;
      if (isLiability(a.type)) p.liabilities += -b;
      else p.assets += b;
    }
    if (LIQUID_TYPES.includes(a.type)) {
      p.liquidTotal += b;
      if (a.purpose === "emergency") { p.reserved += b; p.emergencyFund += b; }
      else if (a.purpose === "tax") { p.reserved += b; p.taxReserve += b; }
      else if (a.purpose === "reserve") p.reserved += b;
      else if (a.purpose === "investment") p.invested += b;
      else { p.available += b; if (a.scope === "business") p.availableBusiness += b; }
    } else if (a.type === "investment") {
      p.invested += b;
    } else if (a.type === "other_asset") {
      p.otherAssets += b;
    }
  }
  p.committed = upcomingOutflows(planned, pending, today, horizonDays).amount;
  p.freeToUse = p.available - p.committed - p.buffer;
  return p;
}
