"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../supabase/server";
import { fail, type ActionResult } from "./result";
import { transactionSchema, uuid, type TransactionInput } from "./schemas";

const refresh = () => { revalidatePath("/", "layout"); };

export async function createTransaction(input: TransactionInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = transactionSchema.parse(input);
    const { supabase } = await requireUser();
    const { data: row, error } = await supabase.from("transactions").insert(data).select("id").single();
    if (error) throw error;
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const data = transactionSchema.parse(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("transactions").update(data).eq("id", id).is("deleted_at", null);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Borrado lógico: el movimiento queda en el historial de cambios. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    // Si venía de una previsión, la previsión vuelve a estar pendiente.
    await supabase.from("planned_items").update({ status: "planned", paid_transaction_id: null }).eq("paid_transaction_id", id);
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function markTransactionPaid(id: string, date: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("transactions").update({ status: "paid", date }).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}
