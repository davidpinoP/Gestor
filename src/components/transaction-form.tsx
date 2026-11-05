"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import type { TransactionInput } from "@/lib/actions/schemas";
import { parseNaturalLanguage } from "@/lib/nl-parser";
import { ACCOUNT_TYPE_LABEL, DEDUCTIBLE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import type { Deductible, PaymentMethod, Scope, Transaction, TxKind } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { CategorySelect } from "./category-select";
import { useRefData } from "./ref-context";
import { Badge, Button, Check, ErrorText, Field, Input, Segmented, Select } from "./ui";

interface Draft {
  kind: TxKind;
  status: "paid" | "pending";
  date: string;
  amount_cents: number | null;
  account_id: string;
  to_account_id: string;
  category_id: string | null;
  scope: Scope;
  business_id: string;
  payment_method: PaymentMethod | "";
  description: string;
  tags: string;
  is_recurring: boolean;
  is_extraordinary: boolean;
  tax_deductible: Deductible;
  source: "manual" | "natural_language";
}

export function TransactionForm({ initial, onDone }: { initial?: Transaction; onDone?: () => void }) {
  const ref = useRefData();
  const router = useRouter();
  const accounts = ref.accounts.filter((a) => !a.archived || a.id === initial?.account_id || a.id === initial?.to_account_id);
  const defaultAccount = accounts.find((a) => a.scope === "personal" && a.type === "checking" && a.purpose === "operating") ?? accounts[0];

  const [d, setD] = useState<Draft>(() => ({
    kind: initial?.kind ?? "expense",
    status: initial?.status ?? "paid",
    date: initial?.date ?? ref.today,
    amount_cents: initial?.amount_cents ?? null,
    account_id: initial?.account_id ?? defaultAccount?.id ?? "",
    to_account_id: initial?.to_account_id ?? "",
    category_id: initial?.category_id ?? null,
    scope: initial?.scope ?? "personal",
    business_id: initial?.business_id ?? "",
    payment_method: initial?.payment_method ?? "",
    description: initial?.description ?? "",
    tags: initial?.tags.join(", ") ?? "",
    is_recurring: initial?.is_recurring ?? false,
    is_extraordinary: initial?.is_extraordinary ?? false,
    tax_deductible: initial?.tax_deductible ?? "no",
    source: "manual",
  }));
  const [nl, setNl] = useState("");
  const [nlNotes, setNlNotes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const activeBusinesses = ref.businesses.filter((b) => b.is_active || b.id === d.business_id);

  function interpret() {
    if (!nl.trim()) return;
    const p = parseNaturalLanguage(nl, { categories: ref.categories, businesses: ref.businesses, accounts, today: ref.today });
    setD((x) => ({
      ...x, kind: p.kind, status: p.status, date: p.date, amount_cents: p.amount_cents ?? x.amount_cents, scope: p.scope,
      business_id: p.business_id ?? "", category_id: p.category_id, account_id: p.account_id ?? x.account_id,
      payment_method: p.payment_method ?? "", description: p.description, source: "natural_language", to_account_id: "",
    }));
    setNlNotes(p.notes);
  }

  function onAccountChange(id: string) {
    const a = accounts.find((x) => x.id === id);
    setD((x) => ({
      ...x, account_id: id,
      ...(a && x.kind !== "transfer" ? { scope: a.scope, business_id: a.business_id ?? (a.scope === "personal" ? "" : x.business_id), category_id: a.scope === x.scope ? x.category_id : null } : {}),
    }));
  }

  const parsedTags = useMemo(() => d.tags.split(",").map((t) => t.trim()).filter(Boolean), [d.tags]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (d.amount_cents === null) return setError("Indica un importe válido mayor que 0.");
    if (!d.account_id) return setError("Selecciona una cuenta. Si no tienes ninguna, créala en Cuentas.");
    const payload: TransactionInput = {
      kind: d.kind, status: d.status, date: d.date, amount_cents: d.amount_cents, account_id: d.account_id,
      to_account_id: d.to_account_id || null, category_id: d.category_id, scope: d.scope, business_id: d.business_id || null,
      payment_method: d.payment_method || null, description: d.description, tags: parsedTags, is_recurring: d.is_recurring,
      is_extraordinary: d.is_extraordinary, tax_deductible: d.tax_deductible, source: d.source,
    };
    start(async () => {
      const r = initial ? await updateTransaction(initial.id, payload) : await createTransaction(payload);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone?.();
    });
  }

  const accountOption = (a: (typeof accounts)[number]) => (
    <option key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABEL[a.type]}{a.scope === "business" ? ` · ${ref.businesses.find((b) => b.id === a.business_id)?.name ?? "Empresa"}` : ""}</option>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      {!initial && (
        <div className="rounded-xl border border-gold/20 bg-gold-soft/40 p-3">
          <label htmlFor="nl" className="mb-2 block text-xs font-medium text-gold">Escríbelo como lo dirías</label>
          <div className="flex gap-2">
            <Input id="nl" value={nl} onChange={(e) => setNl(e.target.value)} placeholder="He gastado 45 € en gasolina para KYZ"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); interpret(); } }} />
            <Button type="button" onClick={interpret} disabled={!nl.trim()}>Interpretar</Button>
          </div>
          {nlNotes && (
            <div className="mt-2 space-y-1 text-xs text-fg-muted">
              <p className="font-medium text-fg">Revisa los campos antes de guardar.</p>
              {nlNotes.map((n) => <p key={n}>· {n}</p>)}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={d.kind} onChange={(k) => setD((x) => ({ ...x, kind: k, category_id: null, to_account_id: "" }))}
          options={[{ value: "expense", label: "Gasto" }, { value: "income", label: "Ingreso" }, { value: "transfer", label: "Transferencia" }]} />
        <Segmented size="sm" value={d.status} onChange={(v) => set("status", v)}
          options={[{ value: "paid", label: d.kind === "income" ? "Cobrado" : "Pagado" }, { value: "pending", label: "Pendiente" }]} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe"><AmountInput cents={d.amount_cents} onChange={(c) => set("amount_cents", c)} autoFocus={!!initial} /></Field>
        <Field label="Fecha"><Input type="date" required value={d.date} onChange={(e) => set("date", e.target.value)} /></Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={d.kind === "transfer" ? "Desde la cuenta" : "Cuenta"}>
          <Select value={d.account_id} onChange={(e) => onAccountChange(e.target.value)} required>
            <option value="" disabled>Selecciona…</option>
            {accounts.map(accountOption)}
          </Select>
        </Field>
        {d.kind === "transfer" ? (
          <Field label="A la cuenta" hint="Las transferencias no cuentan como ingreso ni gasto: evitan la doble contabilización.">
            <Select value={d.to_account_id} onChange={(e) => set("to_account_id", e.target.value)} required>
              <option value="" disabled>Selecciona…</option>
              {accounts.filter((a) => a.id !== d.account_id).map(accountOption)}
            </Select>
          </Field>
        ) : (
          <Field label="Método de pago">
            <Select value={d.payment_method} onChange={(e) => set("payment_method", e.target.value as PaymentMethod | "")}>
              <option value="">—</option>
              {Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        )}
      </div>

      {d.kind !== "transfer" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ámbito" group>
              <Segmented value={d.scope} onChange={(s) => setD((x) => ({ ...x, scope: s, category_id: null, business_id: s === "business" ? x.business_id || activeBusinesses[0]?.id || "" : "" }))}
                options={[{ value: "personal", label: "Personal" }, { value: "business", label: "Empresa" }]} />
            </Field>
            {d.scope === "business" && (
              <Field label="Negocio">
                <Select value={d.business_id} onChange={(e) => set("business_id", e.target.value)} required>
                  <option value="" disabled>Selecciona…</option>
                  {activeBusinesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CategorySelect categories={ref.categories} scope={d.scope} kind={d.kind as "income" | "expense"} value={d.category_id} onChange={(id) => set("category_id", id)} />
          </div>
        </>
      )}

      <Field label="Descripción"><Input value={d.description} maxLength={500} onChange={(e) => set("description", e.target.value)} placeholder="Opcional" /></Field>

      <details className="group rounded-xl border border-white/[0.06] bg-ink-850/50 px-3 py-2" open={!!initial && (d.is_recurring || d.is_extraordinary || d.tax_deductible !== "no" || parsedTags.length > 0)}>
        <summary className="cursor-pointer list-none text-sm text-fg-muted select-none">
          <span className="group-open:hidden">+ </span><span className="hidden group-open:inline">− </span>Más detalles: etiquetas, recurrencia, fiscalidad
        </summary>
        <div className="mt-3 space-y-3 pb-1">
          <Field label="Etiquetas" hint="Separadas por comas">
            <Input value={d.tags} onChange={(e) => set("tags", e.target.value)} placeholder="viaje-madrid, cliente-x" />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Check label={d.kind === "income" ? "Ingreso recurrente" : "Gasto fijo / recurrente"} checked={d.is_recurring} onChange={(v) => setD((x) => ({ ...x, is_recurring: v, is_extraordinary: v ? false : x.is_extraordinary }))} />
            <Check label="Extraordinario" checked={d.is_extraordinary} onChange={(v) => setD((x) => ({ ...x, is_extraordinary: v, is_recurring: v ? false : x.is_recurring }))} />
          </div>
          {d.kind === "expense" && (
            <Field label="Fiscalidad" hint="Indicativo. La deducibilidad debe validarla tu asesor.">
              <Select value={d.tax_deductible} onChange={(e) => set("tax_deductible", e.target.value as Deductible)}>
                {Object.entries(DEDUCTIBLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </details>

      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between gap-3">
        <span>{d.source === "natural_language" && <Badge tone="gold">Interpretado de lenguaje natural</Badge>}</span>
        <div className="flex gap-2">
          {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Guardando…" : initial ? "Guardar cambios" : "Confirmar y guardar"}</Button>
        </div>
      </div>
    </form>
  );
}
