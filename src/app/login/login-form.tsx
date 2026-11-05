"use client";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/actions/auth";
import { Button, ErrorText, Field, Input, Segmented } from "@/components/ui";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-ink-900/80 p-6 backdrop-blur">
      <div className="mb-5 flex justify-center">
        <Segmented value={mode} onChange={setMode} options={[{ value: "in", label: "Iniciar sesión" }, { value: "up", label: "Crear cuenta" }]} />
      </div>
      <form action={mode === "in" ? inAction : upAction} className="space-y-4">
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Contraseña" hint={mode === "up" ? "Mínimo 10 caracteres." : undefined}>
          <Input name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={10} required />
        </Field>
        <ErrorText>{state.error}</ErrorText>
        {state.message && <p className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">{state.message}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>{pending ? "Un momento…" : mode === "in" ? "Entrar" : "Crear cuenta"}</Button>
      </form>
    </div>
  );
}
