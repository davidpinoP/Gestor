import { endOfMonth, monthStartFromKey } from "../dates";
import type { AccountWithBalance, ISODate, Transaction } from "../types";

/** Efecto de un movimiento pagado sobre el saldo de una cuenta (convención patrimonio). */
export function effectOn(t: Pick<Transaction, "kind" | "account_id" | "to_account_id" | "amount_cents">, accountId: string): number {
  if (t.kind === "income" && t.account_id === accountId) return t.amount_cents;
  if (t.kind === "expense" && t.account_id === accountId) return -t.amount_cents;
  if (t.kind === "transfer") {
    if (t.account_id === accountId) return -t.amount_cents;
    if (t.to_account_id === accountId) return t.amount_cents;
  }
  return 0;
}

export interface NetWorthPoint {
  month: string; // YYYY-MM
  netWorth: number;
  liquid: number;
  liabilities: number;
  /** Nº de cuentas existentes al cierre del mes (0 = sin datos, no es patrimonio 0). */
  accountsOpen: number;
}

/**
 * Patrimonio al cierre de cada mes, reconstruido hacia atrás desde los saldos actuales:
 *   saldo(fin de M) = saldo actual − efecto de los movimientos pagados posteriores a M.
 * `txs` debe contener todos los movimientos pagados posteriores al primer mes pedido.
 * Una cuenta no cuenta en los meses anteriores a su fecha de apertura.
 */
export function netWorthHistory(accounts: AccountWithBalance[], txs: Transaction[], monthKeys: string[], today: ISODate): NetWorthPoint[] {
  const paid = txs.filter((t) => t.status === "paid");
  return monthKeys.map((key) => {
    const end = endOfMonth(monthStartFromKey(key));
    const cutoff = end < today ? end : today;
    let netWorth = 0, liquid = 0, liabilities = 0, accountsOpen = 0;
    for (const a of accounts) {
      if (!a.include_in_net_worth) continue;
      if (a.opening_date > cutoff) continue;
      accountsOpen++;
      let bal = a.balance_cents;
      for (const t of paid) {
        if (t.date > cutoff && t.date >= a.opening_date) bal -= effectOn(t, a.id);
      }
      netWorth += bal;
      if (["checking", "savings", "cash"].includes(a.type)) liquid += bal;
      if (["credit_card", "loan", "other_liability"].includes(a.type)) liabilities += -bal;
    }
    return { month: key, netWorth, liquid, liabilities, accountsOpen };
  });
}
