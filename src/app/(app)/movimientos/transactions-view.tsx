"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { useRefData } from "@/components/ref-context";
import { TransactionForm } from "@/components/transaction-form";
import { Badge, Button, Card, Empty, Input, Select, cx } from "@/components/ui";
import { deleteTransaction, markTransactionPaid } from "@/lib/actions/transactions";
import { formatDay } from "@/lib/dates";
import { DEDUCTIBLE_LABEL, KIND_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import type { Transaction } from "@/lib/types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function TransactionsView({ txs, monthKey }: { txs: Transaction[]; monthKey: string }) {
  const ref = useRefData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [scope, setScope] = useState("");
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const accName = (id: string | null) => ref.accounts.find((a) => a.id === id)?.name ?? "—";
  const catOf = (id: string | null) => ref.categories.find((c) => c.id === id);
  const catLabel = (id: string | null) => {
    const c = catOf(id);
    if (!c) return null;
    const parent = c.parent_id ? catOf(c.parent_id) : null;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const rootId = (id: string | null) => { const c = catOf(id); return c ? c.parent_id ?? c.id : null; };
  const bizName = (id: string | null) => ref.businesses.find((b) => b.id === id)?.name;

  const rows = useMemo(() => {
    const nq = norm(q.trim());
    return txs.filter((t) =>
      (!kind || t.kind === kind) && (!scope || t.scope === scope) && (!status || t.status === status) &&
      (!account || t.account_id === account || t.to_account_id === account) && (!category || rootId(t.category_id) === category) &&
      (!nq || norm(`${t.description ?? ""} ${catLabel(t.category_id) ?? ""} ${t.tags.join(" ")} ${bizName(t.business_id) ?? ""}`).includes(nq)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, q, kind, scope, account, category, status]);

  const totals = rows.reduce((s, t) => {
    if (t.status !== "paid") return s;
    if (t.kind === "income") s.income += t.amount_cents;
    if (t.kind === "expense") s.expense += t.amount_cents;
    return s;
  }, { income: 0, expense: 0 });

  const remove = (t: Transaction) => {
    if (!confirm(`¿Eliminar «${t.description || KIND_LABEL[t.kind]}» de ${formatEUR(t.amount_cents)}? Quedará registrado en el historial.`)) return;
    start(async () => { const r = await deleteTransaction(t.id); if (!r.ok) setErr(r.error); else router.refresh(); });
  };
  const pay = (t: Transaction) => start(async () => { const r = await markTransactionPaid(t.id, ref.today); if (!r.ok) setErr(r.error); else router.refresh(); });

  const roots = ref.categories.filter((c) => !c.parent_id && (!scope || c.scope === scope) && (!kind || kind === "transfer" || c.kind === kind));
  const exportHref = (fmt: string) => `/api/export?format=${fmt}&mes=${monthKey}`;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Input placeholder="Buscar descripción, etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} className="lg:col-span-2" />
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setCategory(""); }}>
            <option value="">Todos los tipos</option><option value="income">Ingresos</option><option value="expense">Gastos</option><option value="transfer">Transferencias</option>
          </Select>
          <Select value={scope} onChange={(e) => { setScope(e.target.value); setCategory(""); }}>
            <option value="">Personal y empresa</option><option value="personal">Personal</option><option value="business">Empresa</option>
          </Select>
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Todas las cuentas</option>
            {ref.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {roots.map((c) => <option key={c.id} value={c.id}>{c.name}{!scope ? ` (${c.scope === "business" ? "empresa" : "personal"})` : ""}</option>)}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs">
              <option value="">Pagados y pendientes</option><option value="paid">Sólo pagados</option><option value="pending">Sólo pendientes</option>
            </Select>
            <span className="text-fg-subtle">{rows.length} movimientos</span>
            <span className="num text-good">+{formatEUR(totals.income)}</span>
            <span className="num text-fg-muted">−{formatEUR(totals.expense)}</span>
            <span className={cx("num font-medium", totals.income - totals.expense >= 0 ? "text-good" : "text-bad")}>= {formatEUR(totals.income - totals.expense, { sign: true })}</span>
          </div>
          <div className="flex gap-2">
            <a href={exportHref("csv")} className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-fg-muted hover:bg-white/5">Exportar CSV</a>
            <a href={exportHref("xlsx")} className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-fg-muted hover:bg-white/5">Exportar Excel</a>
          </div>
        </div>
      </Card>

      {err && <p className="text-sm text-bad">{err}</p>}

      {rows.length === 0 ? (
        <Empty title="No hay movimientos con estos filtros">Usa «Registrar movimiento» o escribe una frase como «32 € cena restaurante ayer».</Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((t) => {
              const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "";
              return (
                <li key={t.id} className={cx("group flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] md:px-5", busy && "opacity-70")}>
                  <div className="hidden w-14 shrink-0 text-xs text-fg-subtle sm:block">{formatDay(t.date)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {t.description || (t.kind === "transfer" ? `${accName(t.account_id)} → ${accName(t.to_account_id)}` : catLabel(t.category_id) ?? KIND_LABEL[t.kind])}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                      <span className="sm:hidden">{formatDay(t.date)} ·</span>
                      {t.kind === "transfer" ? <Badge tone="blue">Transferencia</Badge> : catLabel(t.category_id) ? <span>{catLabel(t.category_id)}</span> : <Badge tone="warn">Sin categoría</Badge>}
                      <span>· {t.kind === "transfer" ? `${accName(t.account_id)} → ${accName(t.to_account_id)}` : accName(t.account_id)}</span>
                      {t.business_id && <Badge tone="gold">{bizName(t.business_id)}</Badge>}
                      {t.status === "pending" && <Badge tone="warn">Pendiente</Badge>}
                      {t.is_recurring && <Badge>Recurrente</Badge>}
                      {t.is_extraordinary && <Badge>Extraordinario</Badge>}
                      {t.tax_deductible !== "no" && <Badge tone="blue">{DEDUCTIBLE_LABEL[t.tax_deductible]}</Badge>}
                      {t.payment_method && <span>· {PAYMENT_LABEL[t.payment_method]}</span>}
                      {t.tags.map((tag) => <span key={tag} className="text-fg-subtle">#{tag}</span>)}
                    </div>
                  </div>
                  <div className={cx("num shrink-0 text-right text-sm font-medium", t.kind === "income" && "text-good", t.status === "pending" && "opacity-60")}>{sign}{formatEUR(t.amount_cents)}</div>
                  <div className="flex shrink-0 gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                    {t.status === "pending" && <Button size="sm" variant="ghost" onClick={() => pay(t)} title="Marcar como pagado hoy">✓</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label="Editar">Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t)} aria-label="Eliminar" className="hover:text-bad">✕</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar movimiento">
        {editing && <TransactionForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
