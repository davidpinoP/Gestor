"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "../supabase/server";
import { fail, type ActionResult } from "./result";
import { cents, isoDate, plannedSchema, uuid, type PlannedInput } from "./schemas";

const refresh = () => revalidatePath("/", "layout");

export async function createPlanned(input: PlannedInput): Promise<ActionResult> {
  try {
    const data = plannedSchema.parse(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("planned_items").insert(data);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updatePlanned(id: string, input: PlannedInput): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const data = plannedSchema.parse(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("planned_items").update(data).eq("id", id).is("deleted_at", null);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setPlannedStatus(id: string, status: "planned" | "reserved" | "cancelled"): Promise<ActionResult> {
  try {
    uuid.parse(id);
    z.enum(["planned", "reserved", "cancelled"]).parse(status);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("planned_items").update({ status }).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deletePlanned(id: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("planned_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

const settleSchema = z.object({
  id: uuid,
  amount_cents: cents,
  date: isoDate,
  account_id: uuid,
  payment_method: z.enum(["card", "transfer", "cash", "direct_debit", "bizum", "paypal", "other"]).nullable(),
});

/**
 * Convierte una previsión en movimiento real (importe definitivo, fecha y cuenta),
 * la marca como pagada/cobrada y, si es recurrente, crea la siguiente.
 * Se ejecuta en una única transacción en la base de datos (public.settle_planned).
 */
export async function settlePlanned(input: z.input<typeof settleSchema>): Promise<ActionResult> {
  try {
    const s = settleSchema.parse(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("settle_planned", {
      p_id: s.id, p_amount_cents: s.amount_cents, p_date: s.date, p_account_id: s.account_id, p_payment_method: s.payment_method,
    });
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}
