import Link from "next/link";
import { IncomeExpenseChart, NetWorthChart } from "@/components/charts";
import { Badge, Card, CardHeader, Empty, Stat, cx } from "@/components/ui";
import { formatDay, formatLongDate, formatMonth, monthKey, relativeDays } from "@/lib/dates";
import { buildDashboard } from "@/lib/finance/dashboard";
import type { ScopeFilter } from "@/lib/finance/metrics";
import { loadDashboardData } from "@/lib/data";
import { formatEUR, formatPct } from "@/lib/money";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

const f = (c: number) => formatEUR(c, { decimals: false });

function Delta({ current, previous, invert }: { current: number; previous: number | null; invert?: boolean }) {
  if (previous === null || previous === 0) return <span className="text-fg-subtle">sin referencia</span>;
  const diff = current - previous;
  const good = invert ? diff <= 0 : diff >= 0;
  return <span className={good ? "text-good" : "text-bad"}>{diff >= 0 ? "▲" : "▼"} {formatEUR(Math.abs(diff), { decimals: false })} ({formatPct(Math.abs(diff) / Math.abs(previous), 0)})</span>;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={muted ? "text-fg-subtle" : "text-fg-muted"}>{label}</span>
      <span className="num text-fg">{value}</span>
    </div>
  );
}

const SEVERITY = {
  critical: { ring: "border-bad/40", tag: "bad" as const, label: "Crítico" },
  warning: { ring: "border-warn/30", tag: "warn" as const, label: "Atención" },
  info: { ring: "border-gold/30", tag: "gold" as const, label: "Prioridad" },
  positive: { ring: "border-good/30", tag: "good" as const, label: "Oportunidad" },
};

const ACTION_HREF: Record<string, string> = {
  setup_accounts: "/cuentas", overdue: "/calendario", liquidity_negative: "/calendario", reserve_commitments: "/calendario",
  below_buffer: "/calendario", emergency_fund: "/cuentas", spending_deviation: "/movimientos", start_tracking: "/movimientos",
  allocate_surplus: "/cuentas", hold: "/",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ambito?: string }> }) {
  const sp = await searchParams;
  const scope: ScopeFilter = sp.ambito === "personal" || sp.ambito === "business" ? sp.ambito : "all";
  const { supabase } = await requireUser();
  const data = await loadDashboardData(supabase);
  const db = buildDashboard(data, scope);
  const { position: p, month: m, nextMove: nm } = db;
  const sev = SEVERITY[nm.severity];
  const bizName = (id: string | null) => data.businesses.find((b) => b.id === id)?.name ?? "";
  const goalPct = db.goal.target > 0 && db.goal.avg3 !== null ? Math.min(1, db.goal.avg3 / db.goal.target) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold/80">{formatLongDate(data.today)}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Situación financiera</h1>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-ink-850 p-0.5 text-sm">
          {([["all", "Consolidado"], ["personal", "Personal"], ["business", "Empresa"]] as const).map(([v, l]) => (
            <Link key={v} href={v === "all" ? "/" : `/?ambito=${v}`} className={cx("rounded-md px-3 py-1.5", scope === v ? "bg-ink-700 text-fg" : "text-fg-subtle hover:text-fg-muted")}>{l}</Link>
          ))}
        </div>
      </header>

      {/* YOUR NEXT MOVE */}
      <section className={cx("relative overflow-hidden rounded-2xl border bg-gradient-to-br from-ink-850 via-ink-900 to-ink-900 p-6 md:p-7", sev.ring)}>
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(closest-side,#c8a96a1a,transparent)]" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Your next move</p>
            <Badge tone={sev.tag}>{sev.label}</Badge>
          </div>
          <h2 className="font-display text-2xl font-semibold leading-tight md:text-3xl">{nm.title}</h2>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-fg-muted">{nm.body}</p>
          {nm.facts.length > 0 && (
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              {nm.facts.map((x) => (
                <div key={x.label}><dt className="text-xs text-fg-subtle">{x.label}</dt><dd className="num text-lg font-semibold">{x.value}</dd></div>
              ))}
            </dl>
          )}
          <Link href={ACTION_HREF[nm.code] ?? "/"} className="mt-5 inline-flex h-9 items-center rounded-lg border border-gold/40 px-4 text-sm font-medium text-gold hover:bg-gold-soft">{nm.action} →</Link>
          <p className="mt-4 text-[11px] text-fg-subtle">Recomendación calculada con reglas sobre tus datos registrados. Tú autorizas cualquier operación.</p>
        </div>
      </section>

      {/* Posición */}
      <Card>
        <CardHeader title="Posición" subtitle="Patrimonio neto = activos − pasivos. Lo reservado y lo comprometido ya están descontados de lo libre." />
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Stat label="Patrimonio neto" value={f(p.netWorth)} tone="gold" sub={`Personal ${f(p.netWorthPersonal)} · Empresa ${f(p.netWorthBusiness)}`} />
          <Stat label="Disponible" value={f(p.available)} sub={p.availableBusiness ? `Personal ${f(p.available - p.availableBusiness)} · Empresa ${f(p.availableBusiness)}` : "Cuentas de uso diario"} />
          <Stat label="Comprometido 30 días" value={f(p.committed)} sub="Pagos previstos y pendientes" tone={p.committed > p.available ? "bad" : undefined} />
          <Stat label="Libre para usar" value={f(p.freeToUse)} sub={`Tras colchón de ${f(p.buffer)}`} tone={p.freeToUse < 0 ? "bad" : "good"} />
          <Stat label="Reservado" value={f(p.reserved)} sub={`Emergencia ${f(p.emergencyFund)} · Fiscal ${f(p.taxReserve)}`} />
          <Stat label="Invertido" value={f(p.invested)} />
          <Stat label="Deudas pendientes" value={f(p.liabilities)} tone={p.liabilities > 0 ? "warn" : undefined} />
          <Stat label="Runway" value={db.runway === null ? "—" : `${db.runway.toFixed(1)} meses`} sub="Liquidez ÷ gasto medio (3 m)" help="Meses que podrías cubrir tus gastos medios con la liquidez actual, sin contar la reserva fiscal." />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Evolución patrimonial" subtitle="Cierre de cada mes, reconstruido desde movimientos" />
          {db.history.length > 0 ? <NetWorthChart data={db.history} /> : <Empty title="Sin histórico todavía">Registra cuentas y movimientos para ver tu evolución.</Empty>}
        </Card>
        <Card>
          <CardHeader title="Ingresos vs gastos" subtitle={scope === "all" ? "Consolidado, 12 meses" : scope === "personal" ? "Personal, 12 meses (incluye retribución desde el negocio)" : "Empresa, 12 meses"} />
          {db.flows.some((x) => x.income || x.expense) ? <IncomeExpenseChart data={db.flows} /> : <Empty title="Sin movimientos todavía" />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={`Ingresos · ${formatMonth(monthKey(data.today))}`} />
          <p className="num text-3xl font-semibold">{f(m.income)}</p>
          <p className="mt-1 text-xs"><Delta current={db.monthToDate.income} previous={db.prevToDate.income || null} /> <span className="text-fg-subtle">vs mismo periodo del mes anterior</span></p>
          <div className="mt-4 divide-y divide-white/[0.05]">
            <Row label="Personales" value={f(m.incomePersonal)} />
            <Row label="Empresariales" value={f(m.incomeBusiness)} />
            <Row label="Recurrentes" value={f(m.incomeRecurring)} />
            <Row label="Extraordinarios" value={f(m.incomeExtraordinary)} />
            <Row label="Media 3 meses" value={db.avg3.income === null ? "—" : f(db.avg3.income)} muted />
            {m.pendingIncome > 0 && <Row label="Pendiente de cobro" value={f(m.pendingIncome)} muted />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Gastos del mes" />
          <p className="num text-3xl font-semibold">{f(m.expense)}</p>
          <p className="mt-1 text-xs"><Delta current={db.monthToDate.expense} previous={db.prevToDate.expense || null} invert /> <span className="text-fg-subtle">vs mismo periodo del mes anterior</span></p>
          <div className="mt-4 divide-y divide-white/[0.05]">
            <Row label="Personales" value={f(m.expensePersonal)} />
            <Row label="Empresariales" value={f(m.expenseBusiness)} />
            <Row label="Fijos" value={f(m.expenseFixed)} />
            <Row label="Variables" value={f(m.expenseVariable)} />
            <Row label="Extraordinarios" value={f(m.expenseExtraordinary)} />
            <Row label="Discrecionales" value={f(m.expenseDiscretionary)} />
            <Row label="Previstos resto del mes" value={f(db.expectedRestOfMonth)} muted />
          </div>
        </Card>
        <Card>
          <CardHeader title="Indicadores" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Stat label="Tasa de ahorro" value={formatPct(m.savingsRate)} tone={m.savingsRate === null ? undefined : m.savingsRate >= 0.2 ? "good" : m.savingsRate < 0 ? "bad" : "warn"} />
            <Stat label="Tasa de inversión" value={formatPct(m.investmentRate)} />
            <Stat label="Cash flow" value={f(m.cashFlow)} tone={m.cashFlow >= 0 ? "good" : "bad"} />
            <Stat label="Gastos / ingresos" value={formatPct(m.expenseRatio, 0)} />
            <Stat label="Beneficio empresarial" value={f(m.byBusiness.reduce((s, b) => s + b.profit, 0))} sub="Ingresos − gastos de negocio" />
            <Stat label="Retribución del negocio" value={f(m.ownerDraws)} sub="Transferido a personal" />
          </div>
          <div className="mt-6">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-fg-muted">Objetivo {f(db.goal.target)}/mes personales</span>
              <span className="num text-gold">{goalPct === null ? "—" : formatPct(goalPct, 0)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gold" style={{ width: `${(goalPct ?? 0) * 100}%` }} /></div>
            <p className="mt-1.5 text-xs text-fg-subtle">
              {db.goal.avg3 === null ? "Necesito al menos un mes completo de datos." : `Media ${db.goal.monthsOfData} ${db.goal.monthsOfData === 1 ? "mes" : "meses"}: ${f(db.goal.avg3)} · faltan ${f(Math.max(0, db.goal.target - db.goal.avg3))}/mes`}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Gasto por categoría" subtitle="Mes en curso" />
          {m.byCategory.length === 0 ? <Empty title="Sin gastos este mes" /> : (
            <ul className="space-y-3">
              {m.byCategory.slice(0, 8).map((c) => (
                <li key={c.categoryId ?? "none"}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-fg-muted">{c.name}{!c.isEssential && <Badge tone="warn">discrecional</Badge>}</span>
                    <span className="num">{f(c.amount)}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-series-expense" style={{ width: `${(c.amount / m.byCategory[0].amount) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Desviaciones detectadas" subtitle="Mes actual vs mismos días de los 3 meses previos" />
          {db.deviations.length === 0 ? <Empty title="Sin desviaciones relevantes">Tu gasto por categoría está en línea con tu media comparable.</Empty> : (
            <ul className="space-y-4">
              {db.deviations.slice(0, 4).map((d) => (
                <li key={d.categoryId} className="text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">{d.name}</span><span className="num text-bad">+{f(d.excess)}</span></div>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">Llevas {f(d.current)} frente a una media de {f(d.baseline)}. Si se repite cada mes: {f(d.annualizedImpact)} al año.</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Próximos 30 días" right={<Link href="/calendario" className="text-xs text-gold hover:underline">Calendario →</Link>} />
          {db.upcoming.length === 0 ? <Empty title="Nada previsto">Registra seguros, impuestos y renovaciones en el calendario.</Empty> : (
            <ul className="divide-y divide-white/[0.05]">
              {db.upcoming.map((o) => (
                <li key={`${o.itemId}-${o.date}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{o.name} {o.businessId && <Badge>{bizName(o.businessId)}</Badge>}</p>
                    <p className={cx("text-xs", o.date < data.today ? "text-bad" : "text-fg-subtle")}>{formatDay(o.date)} · {relativeDays(data.today, o.date)}</p>
                  </div>
                  <span className={cx("num shrink-0", o.kind === "income" ? "text-good" : "")}>{o.kind === "income" ? "+" : "−"}{f(o.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.businesses.length > 0 && (
        <Card>
          <CardHeader title="Negocios este mes" subtitle="Resultado de caja: ingresos − gastos registrados con el negocio" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.businesses.filter((b) => b.is_active).map((b) => {
              const r = db.month.byBusiness.find((x) => x.businessId === b.id) ?? { income: 0, expense: 0, profit: 0 };
              const prevR = db.prev.byBusiness.find((x) => x.businessId === b.id);
              return (
                <div key={b.id} className="rounded-xl border border-white/[0.06] bg-ink-850/60 p-4">
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className={cx("num mt-2 text-2xl font-semibold", r.profit < 0 ? "text-bad" : r.profit > 0 ? "text-good" : "")}>{f(r.profit)}</p>
                  <p className="num mt-1 text-xs text-fg-subtle">Ingresos {f(r.income)} · Gastos {f(r.expense)}</p>
                  {prevR && <p className="mt-1 text-xs text-fg-subtle">Mes anterior: {f(prevR.profit)}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
