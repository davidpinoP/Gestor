"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { settlePlanned } from "@/lib/actions/planned";
import { PAYMENT_LABEL } from "@/lib/labels";
import type { PaymentMethod, PlannedItem } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { useRefData } from "./ref-context";
import { Button, ErrorText, Field, Input, Select } from "./ui";

export function SettleForm({ item, onDone }: { item: PlannedItem; onDone: () => void }) {
  const ref = useRefData();
  const router = useRouter();
  const accounts = ref.accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState<number | null>(item.amount_cents);
  const [date, setDate] = useState(ref.today);
  const sameScope = (a: (typeof accounts)[number]) => a.scope === item.scope && (item.scope === "personal" || a.business_id === item.business_id);
  const [accountId, setAccountId] = useState(
    item.account_id ??
      accounts.find((a) => sameScope(a) && a.type === "checking" && a.purpose === "operating")?.id ??
      accounts.find((a) => sameScope(a) && ["checking", "savings", "cash", "credit_card"].includes(a.type))?.id ??
      accounts[0]?.id ?? "",
  );
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const income = item.kind === "income";

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (amount === null) return setError("Importe no válido");
      start(async () => {
        const r = await settlePlanned({ id: item.id, amount_cents: amount, date, account_id: accountId, payment_method: method || null });
        if (!r.ok) return setError(r.error);
        router.refresh();
        onDone();
      });
    }}>
      <p className="text-sm text-fg-muted">Se creará un movimiento real con el importe definitivo{item.recurrence !== "none" ? " y se programará la siguiente repetición" : ""}.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={income ? "Importe cobrado" : "Importe pagado"}><AmountInput cents={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuenta">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Método">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "")}>
            <option value="">—</option>
            {Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={pending || !accountId}>{pending ? "Guardando…" : income ? "Registrar cobro" : "Registrar pago"}</Button>
      </div>
    </form>
  );
}
