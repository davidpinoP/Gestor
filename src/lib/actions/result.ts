import { ZodError } from "zod";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const PG_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con ese nombre.",
  "23514": "Algún dato no cumple las reglas de validación (importe, fechas o tipo).",
  "23503": "No se puede borrar: hay registros que dependen de este elemento. Archívalo en su lugar.",
  "42501": "Referencia no válida o sin permiso.",
};

export function fail(e: unknown): ActionResult<never> {
  if (e instanceof ZodError) return { ok: false, error: e.errors.map((x) => x.message).join(" · ") };
  const err = e as { code?: string; message?: string };
  if (err?.code && PG_MESSAGES[err.code]) return { ok: false, error: PG_MESSAGES[err.code] };
  console.error(e);
  return { ok: false, error: err?.message?.slice(0, 200) || "Error inesperado" };
}
