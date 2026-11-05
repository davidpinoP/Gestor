"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AmountInput } from "@/components/amount-input";
import { useRefData } from "@/components/ref-context";
import { Badge, Button, Card, CardHeader, Check, ErrorText, Field, Input, Segmented, cx } from "@/components/ui";
import { createCategory, updateCategory, updateProfile, upsertBusiness } from "@/lib/actions/settings";
import { formatEUR } from "@/lib/money";
import type { FlowKind, Profile, Scope } from "@/lib/types";

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  at: string;
}

const TABLE_LABEL: Record<string, string> = { transactions: "Movimiento", planned_items: "Previsión", accounts: "Cuenta" };

function describe(e: AuditEntry) {
  const d = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>;
  const name = (d.description as string) || (d.name as string) || "";
  const amount = typeof d.amount_cents === "number" ? formatEUR(d.amount_cents) : typeof d.opening_balance_cents === "number" ? formatEUR(d.opening_balance_cents) : "";
  let action = e.action === "INSERT" ? "creado" : e.action === "DELETE" ? "borrado" : "modificado";
  if (e.action === "UPDATE" && e.new_data?.deleted_at && !e.old_data?.deleted_at) action = "eliminado";
  const changed = e.action === "UPDATE" && e.old_data && e.new_data
    ? Object.keys(e.new_data).filter((k) => !["updated_at"].includes(k) && JSON.stringify(e.new_data![k]) !== JSON.stringify(e.old_data![k]))
    : [];
  return { text: `${TABLE_LABEL[e.table_name] ?? e.table_name} ${action}`, name, amount, changed };
}

export function SettingsView({ profile, audit }: { profile: Profile; audit: AuditEntry[] }) {
  const ref = useRefData();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText = "Guardado") =>
    start(async () => { const r = await fn(); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Error" }); if (r.ok) router.refresh(); });

  // Perfil
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [buffer, setBuffer] = useState<number | null>(profile.min_liquidity_buffer_cents);
  const [months, setMonths] = useState(String(profile.emergency_fund_months));
  const [target, setTarget] = useState<number | null>(profile.monthly_income_target_cents);

  // Negocios
  const [newBiz, setNewBiz] = useState("");

  // Categorías
  const [catScope, setCatScope] = useState<Scope>("personal");
  const [catKind, setCatKind] = useState<FlowKind>("expense");
  const [newCat, setNewCat] = useState("");
  const [newCatParent, setNewCatParent] = useState("");
  const cats = ref.categories.filter((c) => c.scope === catScope && c.kind === catKind);
  const roots = cats.filter((c) => !c.parent_id);

  return (
    <div className="space-y-6">
      {msg && <p className={cx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad")}>{msg.text}</p>}

      <Card>
        <CardHeader title="Parámetros financieros" subtitle="Se usan en el dashboard, el calendario y YOUR NEXT MOVE." />
        <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => {
          e.preventDefault();
          if (buffer === null || target === null) return setMsg({ ok: false, text: "Importes no válidos" });
          run(() => updateProfile({ display_name: displayName, min_liquidity_buffer_cents: buffer, emergency_fund_months: Number(months), monthly_income_target_cents: target }));
        }}>
          <Field label="Nombre"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} /></Field>
          <Field label="Colchón mínimo de liquidez" hint="Nunca se considera libre"><AmountInput cents={buffer} onChange={setBuffer} allowZero /></Field>
          <Field label="Fondo de emergencia (meses)" hint="Meses de gasto personal"><Input type="number" min={0} max={36} value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
          <Field label="Objetivo de ingresos personales/mes"><AmountInput cents={target} onChange={setTarget} allowZero /></Field>
          <div className="md:col-span-4"><Button type="submit" variant="primary" disabled={pending}>Guardar parámetros</Button></div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Negocios" subtitle="Cada negocio separa sus ingresos, gastos y cuentas." />
          <ul className="mb-4 divide-y divide-white/[0.05]">
            {ref.businesses.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <span className={cx(!b.is_active && "text-fg-subtle line-through")}>{b.name}</span>
                <Button size="sm" variant="ghost" onClick={() => run(() => upsertBusiness(b.id, { name: b.name, color: b.color, is_active: !b.is_active }))}>{b.is_active ? "Desactivar" : "Activar"}</Button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newBiz.trim()) run(async () => { const r = await upsertBusiness(null, { name: newBiz }); if (r.ok) setNewBiz(""); return r; }, "Negocio creado"); }}>
            <Input placeholder="Nuevo negocio" value={newBiz} onChange={(e) => setNewBiz(e.target.value)} maxLength={80} />
            <Button type="submit" disabled={pending || !newBiz.trim()}>Añadir</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Copias de seguridad y exportación" subtitle="Tus datos son tuyos. Descárgalos cuando quieras." />
          <div className="flex flex-wrap gap-2">
            <a href="/api/export?format=json" className="inline-flex h-10 items-center rounded-lg bg-gold px-4 text-sm font-medium text-ink-950 hover:bg-[#d6ba7f]">Copia completa (JSON)</a>
            <a href="/api/export?format=xlsx" className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-ink-800 px-4 text-sm hover:bg-ink-700">Todos los movimientos (Excel)</a>
            <a href="/api/export?format=csv" className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-ink-800 px-4 text-sm hover:bg-ink-700">Todos los movimientos (CSV)</a>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-fg-subtle">Además de estas descargas, Supabase realiza copias diarias de la base de datos (y recuperación a un punto en el tiempo en planes de pago). Ningún dato bancario sensible ni credencial se almacena en Wealth OS.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Categorías" subtitle="Las marcadas como discrecionales se vigilan como candidatas a recorte." right={
          <div className="flex flex-wrap gap-2">
            <Segmented size="sm" value={catScope} onChange={(v) => { setCatScope(v); setNewCatParent(""); }} options={[{ value: "personal", label: "Personal" }, { value: "business", label: "Empresa" }]} />
            <Segmented size="sm" value={catKind} onChange={(v) => { setCatKind(v); setNewCatParent(""); }} options={[{ value: "expense", label: "Gastos" }, { value: "income", label: "Ingresos" }]} />
          </div>
        } />
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {roots.map((c) => (
            <li key={c.id} className="border-b border-white/[0.05] py-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={cx(c.archived && "text-fg-subtle line-through")}>{c.name}</span>
                <div className="flex items-center gap-1">
                  {catKind === "expense" && (
                    <button type="button" onClick={() => run(() => updateCategory(c.id, { is_essential: !c.is_essential }))}>
                      <Badge tone={c.is_essential ? "neutral" : "warn"}>{c.is_essential ? "esencial" : "discrecional"}</Badge>
                    </button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => {
                    const n = prompt("Nuevo nombre", c.name);
                    if (n && n.trim() && n !== c.name) run(() => updateCategory(c.id, { name: n }));
                  }}>Renombrar</Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => updateCategory(c.id, { archived: !c.archived }))}>{c.archived ? "Restaurar" : "Archivar"}</Button>
                </div>
              </div>
              {cats.filter((s) => s.parent_id === c.id).map((s) => (
                <div key={s.id} className="flex items-center justify-between pl-4 text-xs text-fg-muted">
                  <span className={cx(s.archived && "line-through")}>↳ {s.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => updateCategory(s.id, { archived: !s.archived }))}>{s.archived ? "Restaurar" : "Archivar"}</Button>
                </div>
              ))}
            </li>
          ))}
        </ul>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (!newCat.trim()) return;
          run(async () => { const r = await createCategory({ scope: catScope, kind: catKind, name: newCat, parent_id: newCatParent || null, is_essential: true }); if (r.ok) setNewCat(""); return r; }, "Categoría creada");
        }}>
          <Input placeholder={newCatParent ? "Nueva subcategoría" : "Nueva categoría"} value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={60} className="max-w-xs" />
          <select value={newCatParent} onChange={(e) => setNewCatParent(e.target.value)} className="h-10 rounded-lg border border-white/10 bg-ink-850 px-3 text-sm">
            <option value="">Como categoría principal</option>
            {roots.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>Subcategoría de {r.name}</option>)}
          </select>
          <Button type="submit" disabled={pending || !newCat.trim()}>Añadir</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Historial de cambios" subtitle="Registro inalterable de altas, cambios y borrados (últimos 40)." />
        {audit.length === 0 ? <p className="text-sm text-fg-subtle">Sin cambios registrados.</p> : (
          <ul className="divide-y divide-white/[0.05] text-sm">
            {audit.map((e) => {
              const d = describe(e);
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="text-fg-muted">{d.text}</span>{d.name && <> · <span>{d.name}</span></>}{d.amount && <span className="num text-fg-subtle"> · {d.amount}</span>}
                    {d.changed.length > 0 && <span className="block text-xs text-fg-subtle">Campos: {d.changed.join(", ")}</span>}
                  </span>
                  <time className="text-xs text-fg-subtle">{new Date(e.at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}</time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
