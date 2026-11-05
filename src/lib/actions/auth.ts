"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "../supabase/server";

const creds = z.object({
  email: z.string().trim().email("Email no válido"),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(128),
});

export type AuthState = { error?: string; message?: string };

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = creds.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Credenciales incorrectas o email sin confirmar." };
  redirect("/");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = creds.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: `${site}/auth/callback` } });
  if (error) return { error: error.message };
  if (data.session) redirect("/");
  return { message: "Cuenta creada. Revisa tu email para confirmarla y después inicia sesión." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
