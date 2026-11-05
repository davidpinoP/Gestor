"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AmountInput } from "@/components/amount-input";
import { Modal } from "@/components/modal";
import { useRefData } from "@/components/ref-context";
import { Badge, Button, Card, Check, Empty, ErrorText, Field, Input, Segmented, Select, cx } from "@/components/ui";
import { createAccount, setAccountArchived, updateAccount } from "@/lib/actions/settings";
import { formatDay } from "@/lib/dates";
import { ACCOUNT_TYPE_LABEL, PURPOSE_LABEL } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { isLiability, type AccountPurpose, type AccountType, type AccountWithBalance, type Scope } from "@/lib/types";

const GROUPS: Array<{ title: string; types: AccountType[] }> = [
  { title: "Liquidez", types: ["checking", "savings", "cash"] },
  { title: "Inversiones y otros activos", types: ["investment", "other_asset"] },
  { title: "Deudas", types: ["credit_card", "loan", "other_liability"] },
];

const DEFAULT_PURPOSE: Record<AccountType, AccountPurpose> = {
  checking: "operating", savings: "reserve", cash: "operating", investment: "investment", other_asset: "investment",
  credit_card: "debt", loan: "debt", other_liability: "debt",
};

function AccountForm({ initial, onDone }: { initial?: AccountWithBalance; onDone: () => void }) {
  const ref = useRefData();
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? "checking");
  const [purpose, setPurpose] = useState<AccountPurpose>(initial?.purpose ?? "operating");
  const [scope, setScope] = useState<Scope>(initial?.scope ?? "personal");
  const [businessId, setBusinessId] = useState(initial?.business_id ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [amount, setAmount] = useState<number | null>(initial ? Math.abs(initial.opening_balance_cents) : 0);
  const [negative, setNegative] = useState(initial ? initial.opening_balance_cents < 0 && !isLiability(initial.type) : false);
  const [date, setDate] = useState(initial?.opening_date ?? ref.today);
  const [inNW, setInNW] = useState(initial?.include_in_net_worth ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const liability = isLiability(type);

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (amount === null) return setError("Saldo no válido");
      start(async () => {
        const payload = { name, type, purpose, scope, business_id: businessId || null, institution, opening_amount_cents: amount, opening_negative: negative, opening_date: date, include_in_net_worth: inNW };
        const r = initial ? await updateAccount(initial.id, payload) : await createAccount(payload);
        if (!r.ok) return setError(r.error);
        router.refresh();
        onDone();
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="BBVA nómina" autoFocus /></Field>
        <Field label="Entidad" hint="Opcional"><Input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={80} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={type} onChange={(e) => { const t = e.target.value as AccountType; setType(t); setPurpose(DEFAULT_PURPOSE[t]); }}>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Propósito" hint="Define si el saldo cuenta como disponible o como reservado.">
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value as AccountPurpose)}>
            {Object.entries(PURPOSE_LABEL).filter(([k]) => liability ? k === "debt" : k !== "debt").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titularidad" group>
          <Segmented value={scope} onChange={(s) => { setScope(s); setBusinessId(s === "business" ? ref.businesses.find((b) => b.is_active)?.id ?? "" : ""); }}
            options={[{ value: "personal", label: "Personal" }, { value: "business", label: "Empresa" }]} />
        </Field>
        {scope === "business" && (
          <Field label="Negocio">
            <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)} required>
              <option value="" disabled>Selecciona…</option>
              {ref.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={liability ? "Deuda pendiente a esa fecha" : "Saldo a esa fecha"}><AmountInput cents={amount} onChange={setAmount} allowZero /></Field>
        <Field label="Fecha del saldo" hint="Saldo al inicio de ese día. Los movimientos anteriores son histórico."><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {!liability && <Check label="Saldo negativo (descubierto)" checked={negative} onChange={setNegative} />}
        <Check label="Incluir en patrimonio neto" checked={inNW} onChange={setInNW} />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Guardando…" : initial ? "Guardar" : "Crear cuenta"}</Button>
      </div>
    </form>
  );
}

export function AccountsView() {
  const ref = useRefData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalance | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [, start] = useTransition();
  const visible = ref.accounts.filter((a) => showArchived || !a.archived);
  const total = ref.accounts.filter((a) => a.include_in_net_worth).reduce((s, a) => s + a.balance_cents, 0);
  const bizName = (id: string | null) => ref.businesses.find((b) => b.id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Patrimonio neto en cuentas: <span className="num font-semibold text-gold">{formatEUR(total)}</span></p>
        <div className="flex items-center gap-3">
          <Check label="Ver archivadas" checked={showArchived} onChange={setShowArchived} />
          <Button variant="primary" onClick={() => setCreating(true)}>+ Nueva cuenta</Button>
        </div>
      </div>
      {visible.length === 0 && <Empty title="Aún no tienes cuentas">Crea tus cuentas bancarias, efectivo, inversiones y deudas con su saldo actual.</Empty>}
      {GROUPS.map((g) => {
        const items = visible.filter((a) => g.types.includes(a.type));
        if (!items.length) return null;
        const sum = items.reduce((s, a) => s + a.balance_cents, 0);
        return (
          <Card key={g.title} className="p-0">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-fg-muted">{g.title}</h2>
              <span className="num text-sm font-semibold">{formatEUR(sum)}</span>
            </div>
            <ul className="divide-y divide-white/[0.05]">
              {items.map((a) => (
                <li key={a.id} className={cx("flex items-center gap-4 px-5 py-3", a.archived && "opacity-50")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}{a.institution && <span className="font-normal text-fg-subtle"> · {a.institution}</span>}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge>{ACCOUNT_TYPE_LABEL[a.type]}</Badge>
                      <Badge tone={a.purpose === "operating" ? "neutral" : a.purpose === "debt" ? "warn" : "good"}>{PURPOSE_LABEL[a.purpose]}</Badge>
                      {a.scope === "business" && <Badge tone="gold">{bizName(a.business_id)}</Badge>}
                      {!a.include_in_net_worth && <Badge>Fuera del patrimonio</Badge>}
                      {a.archived && <Badge>Archivada</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] text-fg-subtle">Saldo inicial {formatEUR(a.opening_balance_cents)} el {formatDay(a.opening_date)}</p>
                  </div>
                  <span className={cx("num shrink-0 text-right font-semibold", a.balance_cents < 0 && "text-bad")}>{formatEUR(a.balance_cents)}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => start(async () => { await setAccountArchived(a.id, !a.archived); router.refresh(); })}>{a.archived ? "Restaurar" : "Archivar"}</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <Card className="text-sm text-fg-subtle">
        <p className="font-medium text-fg-muted">Cómo se calculan los saldos</p>
        <p className="mt-1 leading-relaxed">Saldo = saldo inicial + ingresos − gastos ± transferencias pagadas desde la fecha del saldo inicial. Pagar una tarjeta o un préstamo se registra como <em>transferencia</em> a esa cuenta: reduce la deuda sin contarse como gasto, así nada se contabiliza dos veces. Los movimientos pendientes no alteran el saldo hasta marcarse como pagados.</p>
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva cuenta">{creating && <AccountForm onDone={() => setCreating(false)} />}</Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar cuenta">{editing && <AccountForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}</Modal>
    </div>
  );
}
