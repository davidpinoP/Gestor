"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectionChart } from "@/components/charts";
import { Modal } from "@/components/modal";
import { PlannedForm } from "@/components/planned-form";
import { useRefData } from "@/components/ref-context";
import { SettleForm } from "@/components/settle-form";
import { Badge, Button, Card, CardHeader, Empty, Stat, cx } from "@/components/ui";
import { deletePlanned, setPlannedStatus } from "@/lib/actions/planned";
import { markTransactionPaid } from "@/lib/actions/transactions";
import { addDays, addMonths, dayOfWeekMon0, endOfMonth, formatDay, formatMonth, monthKey, relativeDays } from "@/lib/dates";
import type { Occurrence, PaymentCluster, ProjectionPoint, reservePlan } from "@/lib/finance/planning";
import { CERTAINTY_LABEL, PRIORITY_LABEL, RECURRENCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { formatEUR, formatPct } from "@/lib/money";
import type { PlannedItem } from "@/lib/types";

const f = (c: number) => formatEUR(c, { decimals: false });
const WEEK = ["L", "M", "X", "J", "V", "S", "D"];

interface Props {
  today: string;
  planned: PlannedItem[];
  occurrences: Occurrence[];
  projection: { points: ProjectionPoint[]; min: { date: string; balance: number }; firstNegative: string | null; firstBelowBuffer: string | null; end: number };
  projectionDays: number;
  reserve: ReturnType<typeof reservePlan>;
  clusters: PaymentCluster[];
  position: { available: number; reserved: number; buffer: number; committed: number };
}

export function CalendarView({ today, planned, occurrences, projection, projectionDays, reserve, clusters, position }: Props) {
  const ref = useRefData();
  const router = useRouter();
  const [month, setMonth] = useState(monthKey(today));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlannedItem | null>(null);
  const [settling, setSettling] = useState<PlannedItem | null>(null);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const byId = useMemo(() => new Map(planned.map((p) => [p.id, p])), [planned]);
  const bizName = (id: string | null) => ref.businesses.find((b) => b.id === id)?.name;

  // Ocurrencias del mes visible (las vencidas se muestran en su fecha original)
  const start_ = `${month}-01`;
  const monthOcc = useMemo(() => {
    const end = endOfMonth(start_);
    return occurrences.filter((o) => o.date >= start_ && o.date <= end);
  }, [occurrences, start_]);
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    monthOcc.forEach((o) => m.set(o.date, [...(m.get(o.date) ?? []), o]));
    return m;
  }, [monthOcc]);
  const monthOut = monthOcc.filter((o) => o.kind === "expense").reduce((s, o) => s + o.amount, 0);
  const monthIn = monthOcc.filter((o) => o.kind === "income").reduce((s, o) => s + o.amount, 0);

  const lead = dayOfWeekMon0(start_);
  const daysInMonth = Number(endOfMonth(start_).slice(8, 10));
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(start_, i))];
  while (cells.length % 7) cells.push(null);

  const list = selectedDay ? occurrences.filter((o) => o.date === selectedDay) : occurrences.filter((o) => o.date <= addDays(today, 60));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error ?? "Error"); else { setErr(null); router.refresh(); } });

  const risk = projection.firstNegative ? "bad" : projection.firstBelowBuffer ? "warn" : "good";

  return (
    <div className="space-y-6">
      {/* Alertas de liquidez */}
      {(projection.firstNegative || projection.firstBelowBuffer || clusters.length > 0) && (
        <div className="space-y-2">
          {projection.firstNegative && (
            <div className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm">
              <p className="font-medium text-bad">Liquidez comprometida el {formatDay(projection.firstNegative)}</p>
              <p className="mt-0.5 text-fg-muted">Con lo previsto, tu liquidez mínima sería {f(projection.min.balance)} el {formatDay(projection.min.date)}. Necesitas {f(-projection.min.balance)} adicionales, aplazar pagos prescindibles o adelantar cobros.</p>
            </div>
          )}
          {!projection.firstNegative && projection.firstBelowBuffer && (
            <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm">
              <p className="font-medium text-warn">Por debajo del colchón desde el {formatDay(projection.firstBelowBuffer)}</p>
              <p className="mt-0.5 text-fg-muted">Mínimo proyectado {f(projection.min.balance)} frente a un colchón de {f(position.buffer)}.</p>
            </div>
          )}
          {clusters.map((c) => (
            <div key={c.weekStart} className="rounded-xl border border-warn/20 bg-ink-900 px-4 py-3 text-sm">
              <p className="font-medium text-warn">Semana del {formatDay(c.weekStart)}: {c.count} pagos por {f(c.total)}{c.shareOfLiquidity !== null ? ` (${formatPct(c.shareOfLiquidity, 0)} de tu liquidez)` : ""}</p>
              <p className="mt-0.5 text-fg-muted">{c.items.map((i) => `${i.name} ${f(i.amount)}`).join(" · ")}. Valora repartir o adelantar alguno para no concentrar salidas.</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => { setMonth(monthKey(addMonths(start_, -1))); setSelectedDay(null); }} aria-label="Mes anterior">←</Button>
              <h2 className="min-w-40 text-center font-display text-xl font-semibold">{formatMonth(month)}</h2>
              <Button size="sm" variant="ghost" onClick={() => { setMonth(monthKey(addMonths(start_, 1))); setSelectedDay(null); }} aria-label="Mes siguiente">→</Button>
              {month !== monthKey(today) && <Button size="sm" variant="ghost" onClick={() => setMonth(monthKey(today))}>Hoy</Button>}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="num text-fg-muted">Salidas <span className="text-fg">{f(monthOut)}</span></span>
              <span className="num text-fg-muted">Entradas <span className="text-good">{f(monthIn)}</span></span>
              <Button size="sm" variant="primary" onClick={() => setCreating(selectedDay ?? today)}>+ Previsión</Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-fg-subtle">{WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const items = byDay.get(d) ?? [];
              const out = items.filter((o) => o.kind === "expense").reduce((s, o) => s + o.amount, 0);
              const inn = items.filter((o) => o.kind === "income").reduce((s, o) => s + o.amount, 0);
              const overdue = d < today && items.some((o) => o.kind === "expense");
              return (
                <button key={d} type="button" onClick={() => setSelectedDay(selectedDay === d ? null : d)}
                  className={cx("flex min-h-16 flex-col items-stretch rounded-lg border p-1.5 text-left transition-colors md:min-h-20",
                    selectedDay === d ? "border-gold/60 bg-gold-soft" : "border-white/[0.05] bg-ink-850/50 hover:border-white/15",
                    d === today && "ring-1 ring-gold/50")}>
                  <span className={cx("text-xs", d === today ? "font-semibold text-gold" : d < today ? "text-fg-subtle" : "text-fg-muted")}>{Number(d.slice(8))}</span>
                  {out > 0 && <span className={cx("num mt-auto truncate text-[10px] md:text-[11px]", overdue ? "text-bad" : "text-fg")}>−{f(out)}</span>}
                  {inn > 0 && <span className="num truncate text-[10px] text-good md:text-[11px]">+{f(inn)}</span>}
                  {items.length > 1 && <span className="text-[9px] text-fg-subtle">{items.length} pagos</span>}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Plan de reserva" subtitle="Para llegar cubierto a cada vencimiento de los próximos 12 meses" />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Apartar cada semana" value={f(reserve.weeklyTotal)} tone="gold" />
            <Stat label="o cada mes" value={f(reserve.monthlyTotal)} />
            <Stat label="Previsto 12 meses" value={f(reserve.totalUpcoming)} />
            <Stat label="Ya cubierto" value={f(reserve.totalCovered)} sub={`Reservas: ${f(position.reserved)}`} tone={reserve.totalCovered > 0 ? "good" : undefined} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
            El saldo de tus cuentas de reserva y emergencia se asigna primero a los pagos más próximos; el resto se reparte en aportaciones semanales hasta cada fecha. Las aportaciones de pagos cercanos pesan más.
          </p>
          {reserve.lines.length > 0 && (
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {reserve.lines.slice(0, 12).map((l) => (
                <li key={`${l.itemId}-${l.date}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-fg-muted">{formatDay(l.date)} · {l.name}</span>
                  <span className="num shrink-0">{l.remaining === 0 ? <span className="text-good">cubierto</span> : `${f(l.perWeek)}/sem`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`Proyección de liquidez · ${projectionDays} días`} subtitle="Disponible + reservas, aplicando previsiones y pendientes. No supone ingresos que no hayas previsto." />
          <ProjectionChart data={projection.points} buffer={position.buffer} />
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Stat label="Liquidez hoy" value={f(position.available + position.reserved)} />
            <Stat label="Mínimo proyectado" value={f(projection.min.balance)} sub={formatDay(projection.min.date)} tone={risk === "good" ? undefined : risk} />
            <Stat label={`En ${projectionDays} días`} value={f(projection.end)} />
          </div>
        </Card>

        <Card>
          <CardHeader title={selectedDay ? formatDay(selectedDay) : "Próximos 60 días"} right={selectedDay ? <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>Ver todo</Button> : undefined} />
          {err && <p className="mb-2 text-sm text-bad">{err}</p>}
          {list.length === 0 ? <Empty title="Nada previsto" /> : (
            <ul className={cx("divide-y divide-white/[0.05]", busy && "opacity-70")}>
              {list.map((o) => {
                const item = o.source === "planned" ? byId.get(o.itemId) : undefined;
                return (
                  <li key={`${o.itemId}-${o.date}`} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.name}</p>
                        <p className={cx("text-xs", o.date < today ? "text-bad" : "text-fg-subtle")}>{formatDay(o.date)} · {relativeDays(today, o.date)}{o.dueDate ? ` · límite ${formatDay(o.dueDate)}` : ""}</p>
                      </div>
                      <span className={cx("num shrink-0 text-sm", o.kind === "income" && "text-good")}>{o.kind === "income" ? "+" : "−"}{f(o.amount)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {o.source === "pending_tx" ? <Badge tone="warn">Movimiento pendiente</Badge> : <Badge tone={o.status === "reserved" ? "good" : "neutral"}>{STATUS_LABEL[o.status]}</Badge>}
                      {o.virtual && <Badge>Repetición</Badge>}
                      {item && item.recurrence !== "none" && !o.virtual && <Badge>{RECURRENCE_LABEL[item.recurrence]}</Badge>}
                      {o.priority === "high" && <Badge tone="bad">Prioridad {PRIORITY_LABEL.high.toLowerCase()}</Badge>}
                      {!o.isMandatory && <Badge tone="blue">Prescindible</Badge>}
                      {o.certainty !== "exact" && <Badge>{CERTAINTY_LABEL[o.certainty]}</Badge>}
                      {o.businessId && <Badge tone="gold">{bizName(o.businessId)}</Badge>}
                    </div>
                    {!o.virtual && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item && <Button size="sm" variant="secondary" onClick={() => setSettling(item)}>{o.kind === "income" ? "Cobrado" : "Pagado"}</Button>}
                        {o.source === "pending_tx" && <Button size="sm" variant="secondary" onClick={() => run(() => markTransactionPaid(o.itemId, today))}>Marcar pagado hoy</Button>}
                        {item && o.kind === "expense" && (
                          <Button size="sm" variant="ghost" onClick={() => run(() => setPlannedStatus(item.id, item.status === "reserved" ? "planned" : "reserved"))}>
                            {item.status === "reserved" ? "Quitar reserva" : "Marcar reservado"}
                          </Button>
                        )}
                        {item && <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>Editar</Button>}
                        {item && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`¿Cancelar «${item.name}»?`)) run(() => setPlannedStatus(item.id, "cancelled")); }}>Cancelar</Button>}
                        {item && <Button size="sm" variant="ghost" className="hover:text-bad" onClick={() => { if (confirm(`¿Eliminar «${item.name}»?`)) run(() => deletePlanned(item.id)); }}>✕</Button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!creating} onClose={() => setCreating(null)} title="Nueva previsión">
        {creating && <PlannedForm defaultDate={creating < today ? today : creating} onDone={() => setCreating(null)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar previsión">
        {editing && <PlannedForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!settling} onClose={() => setSettling(null)} title={settling?.kind === "income" ? "Registrar cobro" : "Registrar pago"}>
        {settling && <SettleForm key={settling.id} item={settling} onDone={() => setSettling(null)} />}
      </Modal>
    </div>
  );
}
