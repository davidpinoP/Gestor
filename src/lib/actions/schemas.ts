import { z } from "zod";
import { isValidISODate } from "../dates";

export const uuid = z.string().uuid("Identificador no válido");
export const optUuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().uuid().nullable());
export const isoDate = z.string().refine(isValidISODate, "Fecha no válida");
export const optDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().refine(isValidISODate, "Fecha no válida").nullable());
export const cents = z.number({ invalid_type_error: "Importe no válido" }).int("Importe no válido").positive("El importe debe ser mayor que 0").max(99_999_999_999, "Importe demasiado alto");
export const signedCents = z.number().int().min(-99_999_999_999).max(99_999_999_999);
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v ?? null), z.string().max(max).nullable());

export const scope = z.enum(["personal", "business"]);

export const transactionSchema = z
  .object({
    kind: z.enum(["income", "expense", "transfer"]),
    status: z.enum(["paid", "pending"]),
    date: isoDate,
    amount_cents: cents,
    account_id: uuid,
    to_account_id: optUuid,
    category_id: optUuid,
    scope,
    business_id: optUuid,
    payment_method: z.preprocess((v) => (v === "" ? null : v), z.enum(["card", "transfer", "cash", "direct_debit", "bizum", "paypal", "other"]).nullable()),
    description: optText(500),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    is_recurring: z.boolean().default(false),
    is_extraordinary: z.boolean().default(false),
    tax_deductible: z.enum(["no", "yes", "pending_validation"]).default("no"),
    source: z.enum(["manual", "natural_language"]).default("manual"),
  })
  .superRefine((t, ctx) => {
    if (t.kind === "transfer") {
      if (!t.to_account_id) ctx.addIssue({ code: "custom", message: "Indica la cuenta de destino" });
      if (t.to_account_id === t.account_id) ctx.addIssue({ code: "custom", message: "La cuenta de origen y destino no pueden ser la misma" });
    }
    if (t.scope === "business" && !t.business_id) ctx.addIssue({ code: "custom", message: "Selecciona el negocio" });
    if (t.is_recurring && t.is_extraordinary) ctx.addIssue({ code: "custom", message: "Un movimiento no puede ser recurrente y extraordinario a la vez" });
  })
  .transform((t) => ({
    ...t,
    to_account_id: t.kind === "transfer" ? t.to_account_id : null,
    category_id: t.kind === "transfer" ? null : t.category_id,
    business_id: t.scope === "business" ? t.business_id : null,
  }));
export type TransactionInput = z.input<typeof transactionSchema>;

export const plannedSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    name: z.string().trim().min(1, "Pon un nombre").max(120),
    amount_cents: cents,
    expected_date: isoDate,
    due_date: optDate,
    category_id: optUuid,
    scope,
    business_id: optUuid,
    account_id: optUuid,
    priority: z.enum(["high", "medium", "low"]),
    status: z.enum(["planned", "reserved"]).default("planned"),
    is_mandatory: z.boolean(),
    certainty: z.enum(["exact", "estimated", "approximate"]),
    recurrence: z.enum(["none", "weekly", "monthly", "quarterly", "yearly"]),
    recurrence_end: optDate,
    notes: optText(2000),
  })
  .superRefine((p, ctx) => {
    if (p.due_date && p.due_date < p.expected_date) ctx.addIssue({ code: "custom", message: "La fecha límite no puede ser anterior a la prevista" });
    if (p.scope === "business" && !p.business_id) ctx.addIssue({ code: "custom", message: "Selecciona el negocio" });
  })
  .transform((p) => ({ ...p, business_id: p.scope === "business" ? p.business_id : null, recurrence_end: p.recurrence === "none" ? null : p.recurrence_end }));
export type PlannedInput = z.input<typeof plannedSchema>;

export const accountSchema = z
  .object({
    name: z.string().trim().min(1, "Pon un nombre").max(80),
    type: z.enum(["checking", "savings", "cash", "investment", "credit_card", "loan", "other_asset", "other_liability"]),
    purpose: z.enum(["operating", "reserve", "emergency", "tax", "investment", "debt"]),
    scope,
    business_id: optUuid,
    institution: optText(80),
    /** Siempre positivo desde el formulario; el signo lo decide el tipo de cuenta. */
    opening_amount_cents: z.number().int().min(0).max(99_999_999_999),
    opening_negative: z.boolean().default(false),
    opening_date: isoDate,
    include_in_net_worth: z.boolean().default(true),
  })
  .superRefine((a, ctx) => {
    if (a.scope === "business" && !a.business_id) ctx.addIssue({ code: "custom", message: "Selecciona el negocio" });
  });
export type AccountInput = z.input<typeof accountSchema>;

export const categorySchema = z.object({
  scope,
  kind: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Pon un nombre").max(60),
  parent_id: optUuid,
  is_essential: z.boolean().default(true),
});

export const businessSchema = z.object({
  name: z.string().trim().min(1, "Pon un nombre").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido").default("#C8A96A"),
  is_active: z.boolean().default(true),
});

export const profileSchema = z.object({
  display_name: optText(80),
  min_liquidity_buffer_cents: z.number().int().min(0).max(99_999_999_999),
  emergency_fund_months: z.number().int().min(0).max(36),
  monthly_income_target_cents: z.number().int().min(0).max(99_999_999_999),
});
