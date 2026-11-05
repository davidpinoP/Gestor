import type { AccountPurpose, AccountType, Certainty, Deductible, PaymentMethod, PlannedStatus, Priority, Recurrence, TxKind } from "./types";

export const KIND_LABEL: Record<TxKind, string> = { income: "Ingreso", expense: "Gasto", transfer: "Transferencia" };
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Cuenta corriente", savings: "Cuenta de ahorro", cash: "Efectivo", investment: "Inversión",
  credit_card: "Tarjeta de crédito", loan: "Préstamo", other_asset: "Otro activo", other_liability: "Otra deuda",
};
export const PURPOSE_LABEL: Record<AccountPurpose, string> = {
  operating: "Uso diario", reserve: "Reserva para pagos", emergency: "Fondo de emergencia", tax: "Reserva fiscal", investment: "Inversión", debt: "Deuda",
};
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  card: "Tarjeta", transfer: "Transferencia", cash: "Efectivo", direct_debit: "Domiciliación", bizum: "Bizum", paypal: "PayPal", other: "Otro",
};
export const DEDUCTIBLE_LABEL: Record<Deductible, string> = { no: "No deducible", yes: "Deducible", pending_validation: "Pendiente de validar" };
export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };
export const STATUS_LABEL: Record<PlannedStatus, string> = { planned: "Previsto", reserved: "Reservado", paid: "Pagado", cancelled: "Cancelado" };
export const CERTAINTY_LABEL: Record<Certainty, string> = { exact: "Importe exacto", estimated: "Estimado", approximate: "Aproximado" };
export const RECURRENCE_LABEL: Record<Recurrence, string> = { none: "Puntual", weekly: "Semanal", monthly: "Mensual", quarterly: "Trimestral", yearly: "Anual" };
