import type { Account, Business, Category, Transaction } from "./types";
import { DEDUCTIBLE_LABEL, KIND_LABEL, PAYMENT_LABEL } from "./labels";

export const EXPORT_HEADERS = [
  "Fecha", "Tipo", "Estado", "Importe (EUR)", "Importe con signo (EUR)", "Cuenta", "Cuenta destino", "Categoría", "Subcategoría",
  "Ámbito", "Negocio", "Método de pago", "Descripción", "Etiquetas", "Recurrente", "Extraordinario", "Fiscalidad", "Origen", "ID",
];

export function exportRows(txs: Transaction[], ref: { accounts: Account[]; categories: Category[]; businesses: Business[] }) {
  const acc = (id: string | null) => ref.accounts.find((a) => a.id === id)?.name ?? "";
  const cat = (id: string | null) => ref.categories.find((c) => c.id === id);
  return txs.map((t) => {
    const c = cat(t.category_id);
    const parent = c?.parent_id ? cat(c.parent_id) : null;
    const amount = t.amount_cents / 100;
    const signed = t.kind === "income" ? amount : t.kind === "expense" ? -amount : 0;
    return [
      t.date, KIND_LABEL[t.kind], t.status === "paid" ? "Pagado" : "Pendiente", amount, signed, acc(t.account_id), acc(t.to_account_id),
      parent ? parent.name : c?.name ?? "", parent ? c?.name ?? "" : "", t.scope === "business" ? "Empresa" : "Personal",
      ref.businesses.find((b) => b.id === t.business_id)?.name ?? "", t.payment_method ? PAYMENT_LABEL[t.payment_method] : "",
      t.description ?? "", t.tags.join(", "), t.is_recurring ? "Sí" : "No", t.is_extraordinary ? "Sí" : "No",
      DEDUCTIBLE_LABEL[t.tax_deductible], t.source, t.id,
    ] as Array<string | number>;
  });
}

/** Evita inyección de fórmulas al abrir el CSV en Excel/Sheets. */
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCSV(rows: Array<Array<string | number>>, headers = EXPORT_HEADERS): string {
  const cell = (v: string | number) => {
    if (typeof v === "number") return v.toFixed(2).replace(".", ",");
    const s = safeText(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Separador ";" y decimales con coma: formato que Excel en español abre directamente.
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export { safeText };
