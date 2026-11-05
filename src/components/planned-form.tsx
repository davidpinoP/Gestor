"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlanned, updatePlanned } from "@/lib/actions/planned";
import { addMonths } from "@/lib/dates";
import { CERTAINTY_LABEL, PRIORITY_LABEL, RECURRENCE_LABEL } from "@/lib/labels";
import type { Certainty, PlannedItem, Priority, Recurrence, Scope } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { CategorySelect } from "./category-select";
import { useRefData } from "./ref-context";
import { Button, Check, ErrorText, Field, Input, Segmented, Select, Textarea } from "./ui";

export function PlannedForm({ initial, defaultDate, onDone }: { initial?: PlannedItem; defaultDate?: string; onDone: () => void }) {
  const ref = useRefData();
  const router = useRouter();
  const [kind, setKind] = useState<"income" | "expense">(initial?.kind ?? "expense");
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState<number | null>(initial?.amount_cents ?? null);
  const [expected, setExpected] = useState(initial?.expected_date ?? defaultDate ?? ref.today);
  const [due, setDue] = useState(initial?.due_date ?? "");
  const [scope, setScope] = useState<Scope>(initial?.scope ?? "personal");
  const [businessId, setBusinessId] = useState(initial?.business_id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [accountId, setAccountId] = useState(initial?.account_id ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [mandatory, setMandatory] = useState(initial?.is_mandatory ?? true);
  const [certainty, setCertainty] = useState<Certainty>(initial?.certainty ?? "estimated");
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? "none");
  const [recEnd, setRecEnd] = useState(initial?.recurrence_end ?? "");
  const [reserved, setReserved] = useState(initial?.status === "reserved");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amount === null) return setError("Indica un importe válido.");
    const payload = {
      kind, name, amount_cents: amount, expected_date: expected, due_date: due || null, category_id: categoryId, scope,
      business_id: businessId || null, account_id: accountId || null, priority, status: reserved ? "reserved" as const : "planned" as const,
      is_mandatory: mandatory, certainty, recurrence, recurrence_end: recEnd || null, notes,
    };
    start(async () => {
      const r = initial ? await updatePlanned(initial.id, payload) : await createPlanned(payload);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(null); }} options={[{ value: "expense", label: "Gasto previsto" }, { value: "income", label: "Ingreso previsto" }]} />
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Seguro del coche" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe estimado"><AmountInput cents={amount} onChange={setAmount} /></Field>
        <Field label="Certeza del importe">
          <Select value={certainty} onChange={(e) => setCertainty(e.target.value as Certainty)}>
            {Object.entries(CERTAINTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha prevista">
          <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} required />
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 6].map((n) => (
              <button key={n} type="button" onClick={() => setExpected(addMonths(ref.today, n))} className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-fg-subtle hover:text-fg">+{n} m</button>
            ))}
          </div>
        </Field>
        <Field label="Fecha límite" hint="Opcional"><Input type="date" value={due} min={expected} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ámbito" group>
          <Segmented value={scope} onChange={(s) => { setScope(s); setCategoryId(null); setBusinessId(s === "business" ? ref.businesses.find((b) => b.is_active)?.id ?? "" : ""); }}
            options={[{ value: "personal", label: "Personal" }, { value: "business", label: "Empresa" }]} />
        </Field>
        {scope === "business" && (
          <Field label="Negocio">
            <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)} required>
              <option value="" disabled>Selecciona…</option>
              {ref.businesses.filter((b) => b.is_active || b.id === businessId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CategorySelect categories={ref.categories} scope={scope} kind={kind} value={categoryId} onChange={setCategoryId} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Prioridad">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Repetición">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            {Object.entries(RECURRENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {recurrence !== "none" ? (
          <Field label="Repetir hasta" hint="Vacío = indefinido"><Input type="date" value={recEnd} min={expected} onChange={(e) => setRecEnd(e.target.value)} /></Field>
        ) : (
          <Field label="Cuenta de pago">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sin definir</option>
              {ref.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {kind === "expense" && <Check label="Obligatorio" hint="Desmárcalo si es prescindible o aplazable" checked={mandatory} onChange={setMandatory} />}
        {kind === "expense" && <Check label="Ya tengo el dinero apartado" hint="Se cubre con tus cuentas de reserva" checked={reserved} onChange={setReserved} />}
      </div>
      <Field label="Notas"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Guardando…" : initial ? "Guardar cambios" : "Añadir al calendario"}</Button>
      </div>
    </form>
  );
}
