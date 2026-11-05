"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "../supabase/server";
import { isLiability } from "../types";
import { fail, type ActionResult } from "./result";
import { accountSchema, businessSchema, categorySchema, profileSchema, uuid, type AccountInput } from "./schemas";

const refresh = () => revalidatePath("/", "layout");

function accountRow(input: AccountInput) {
  const a = accountSchema.parse(input);
  const sign = isLiability(a.type) || a.opening_negative ? -1 : 1;
  const { opening_amount_cents, opening_negative: _n, ...rest } = a;
  return { ...rest, business_id: a.scope === "business" ? a.business_id : null, opening_balance_cents: sign * opening_amount_cents };
}

export async function createAccount(input: AccountInput): Promise<ActionResult> {
  try {
    const row = accountRow(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("accounts").insert(row);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateAccount(id: string, input: AccountInput): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const row = accountRow(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("accounts").update(row).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setAccountArchived(id: string, archived: boolean): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("accounts").update({ archived }).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function createCategory(input: z.input<typeof categorySchema>): Promise<ActionResult> {
  try {
    const c = categorySchema.parse(input);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("categories").insert(c);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateCategory(id: string, patch: { name?: string; is_essential?: boolean; archived?: boolean }): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const p = z.object({ name: z.string().trim().min(1).max(60).optional(), is_essential: z.boolean().optional(), archived: z.boolean().optional() }).parse(patch);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("categories").update(p).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function upsertBusiness(id: string | null, input: z.input<typeof businessSchema>): Promise<ActionResult> {
  try {
    const b = businessSchema.parse(input);
    const { supabase } = await requireUser();
    const { error } = id ? await supabase.from("businesses").update(b).eq("id", uuid.parse(id)) : await supabase.from("businesses").insert(b);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    const p = profileSchema.parse(input);
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update(p).eq("id", user.id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}
