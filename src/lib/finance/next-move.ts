import { formatEUR, formatPct } from "../money";
import { formatDay, daysBetween } from "../dates";
import type { ISODate } from "../types";
import type { Position } from "./position";
import type { Occurrence } from "./planning";
import type { CategoryDeviation } from "./metrics";

export type Severity = "critical" | "warning" | "info" | "positive";

export interface NextMove {
  code: string;
  severity: Severity;
  title: string;
  body: string;
  action: string;
  facts: Array<{ label: string; value: string }>;
}

export interface NextMoveInput {
  today: ISODate;
  position: Position;
  projection: { min: { date: ISODate; balance: number }; firstNegative: ISODate | null; firstBelowBuffer: ISODate | null };
  projectionDays: number;
  occurrences: Occurrence[];
  avgMonthlyExpense: number | null;
  avgMonthlyPersonalExpense: number | null;
  emergencyMonthsTarget: number;
  deviations: CategoryDeviation[];
  hasAccounts: boolean;
  hasTransactions: boolean;
}

/**
 * Motor determinista de "YOUR NEXT MOVE": una única prioridad del día, elegida por
 * orden de gravedad. Cada regla se apoya sólo en datos registrados; nunca recomienda
 * comprometer dinero necesario para obligaciones próximas.
 */
export function computeNextMove(i: NextMoveInput): NextMove {
  const { position: p, today } = i;
  const f = (c: number) => formatEUR(c, { decimals: false });

  if (!i.hasAccounts) {
    return {
      code: "setup_accounts", severity: "info",
      title: "Registra tus cuentas y su saldo actual",
      body: "Sin saldos reales no es posible saber cuánto dinero tienes ni cuánto puedes usar. Da de alta tus cuentas bancarias, efectivo, inversiones y deudas con el saldo de hoy.",
      action: "Ir a Cuentas", facts: [],
    };
  }

  const overdue = i.occurrences.filter((o) => o.kind === "expense" && !o.virtual && o.date < today && o.status === "planned");
  if (overdue.length > 0) {
    const total = overdue.reduce((s, o) => s + o.amount, 0);
    return {
      code: "overdue", severity: "critical",
      title: `Tienes ${overdue.length} ${overdue.length === 1 ? "pago vencido" : "pagos vencidos"} por ${f(total)}`,
      body: `Antes de cualquier otra decisión, regulariza ${overdue.map((o) => `«${o.name}» (${f(o.amount)}, ${formatDay(o.date)})`).slice(0, 3).join(", ")}. Si ya están pagados, márcalos como pagados para que tu liquidez sea exacta.`,
      action: "Revisar calendario", facts: [{ label: "Vencido", value: f(total) }, { label: "Disponible", value: f(p.available) }],
    };
  }

  if (i.projection.firstNegative) {
    const d = i.projection.firstNegative;
    const shortfall = -i.projection.min.balance;
    return {
      code: "liquidity_negative", severity: "critical",
      title: `Tu liquidez se vuelve negativa ${daysBetween(today, d) <= 1 ? "de inmediato" : `el ${formatDay(d)}`}`,
      body: `Con los pagos e ingresos previstos, tu liquidez mínima en los próximos ${i.projectionDays} días sería de ${f(i.projection.min.balance)} (${formatDay(i.projection.min.date)}). Necesitas cubrir ${f(shortfall)}: aplaza gastos prescindibles, adelanta cobros o reserva ya. No comprometas capital nuevo.`,
      action: "Ver proyección de liquidez",
      facts: [{ label: "Déficit máximo", value: f(shortfall) }, { label: "Fecha crítica", value: formatDay(i.projection.min.date) }, { label: "Liquidez hoy", value: f(p.available + p.reserved) }],
    };
  }

  if (p.committed > 0 && p.committed >= p.available * 0.5) {
    return {
      code: "reserve_commitments", severity: "warning",
      title: "Tu prioridad de hoy no es invertir: es reservar",
      body: `Tienes ${f(p.committed)} en pagos previstos durante los próximos ${p.committedHorizonDays} días y tu liquidez disponible es de ${f(p.available)} (${formatPct(p.committed / Math.max(1, p.available), 0)} comprometido). Reserva ${f(p.committed)} y evita comprometer capital adicional hasta recibir los próximos ingresos.`,
      action: "Ver calendario de pagos",
      facts: [{ label: "Comprometido", value: f(p.committed) }, { label: "Disponible", value: f(p.available) }, { label: "Libre tras colchón", value: f(p.freeToUse) }],
    };
  }

  if (i.projection.firstBelowBuffer) {
    return {
      code: "below_buffer", severity: "warning",
      title: i.projection.firstBelowBuffer <= today
        ? "Tu liquidez ya está por debajo de tu colchón mínimo"
        : `Tu liquidez caerá por debajo del colchón el ${formatDay(i.projection.firstBelowBuffer)}`,
      body: `El colchón mínimo que has definido es ${f(p.buffer)}. La proyección marca un mínimo de ${f(i.projection.min.balance)} el ${formatDay(i.projection.min.date)}. Mantén el dinero en liquidez hasta superar esa fecha.`,
      action: "Ver proyección", facts: [{ label: "Mínimo proyectado", value: f(i.projection.min.balance) }, { label: "Colchón", value: f(p.buffer) }],
    };
  }

  if (i.avgMonthlyPersonalExpense && i.emergencyMonthsTarget > 0) {
    const target = i.avgMonthlyPersonalExpense * i.emergencyMonthsTarget;
    if (p.emergencyFund < target) {
      const gap = target - p.emergencyFund;
      const canNow = Math.max(0, Math.min(gap, p.freeToUse));
      return {
        code: "emergency_fund", severity: "info",
        title: "Construye tu fondo de emergencia antes de invertir",
        body: `Tu gasto personal medio es ${f(i.avgMonthlyPersonalExpense)}/mes, así que ${i.emergencyMonthsTarget} meses de cobertura son ${f(target)}. Tienes ${f(p.emergencyFund)} apartados: faltan ${f(gap)}.${canNow > 0 ? ` Hoy puedes mover ${f(canNow)} a tu cuenta de emergencia sin tocar pagos previstos ni tu colchón.` : " Ahora mismo no hay margen libre: prioriza aportaciones al recibir ingresos."}`,
        action: canNow > 0 ? `Transferir ${f(canNow)} a emergencia` : "Revisar cuentas",
        facts: [{ label: "Objetivo", value: f(target) }, { label: "Cobertura actual", value: `${(p.emergencyFund / i.avgMonthlyPersonalExpense).toFixed(1)} meses` }, { label: "Libre hoy", value: f(Math.max(0, p.freeToUse)) }],
      };
    }
  }

  const dev = i.deviations.find((d) => !d.isEssential) ?? i.deviations[0];
  if (dev) {
    return {
      code: "spending_deviation", severity: "warning",
      title: `Corrige el gasto en ${dev.name}`,
      body: `Este mes llevas ${f(dev.current)} en ${dev.name}. En los mismos ${dev.comparableDays} días de los ${dev.monthsCompared} meses anteriores gastaste de media ${f(dev.baseline)}: ${f(dev.excess)} más de lo habitual. Si este exceso se repitiera cada mes, serían ${f(dev.annualizedImpact)} al año.`,
      action: "Ver movimientos", facts: [{ label: "Este mes", value: f(dev.current) }, { label: "Media comparable", value: f(dev.baseline) }, { label: "Impacto anual", value: f(dev.annualizedImpact) }],
    };
  }

  if (!i.hasTransactions) {
    return {
      code: "start_tracking", severity: "info",
      title: "Empieza a registrar cada movimiento",
      body: "Con un mes de datos reales podré calcular tu tasa de ahorro, runway y desviaciones de gasto. Registra ingresos y gastos a diario: basta una frase como «45 € gasolina KYZ».",
      action: "Registrar movimiento", facts: [],
    };
  }

  if (p.freeToUse > 0) {
    return {
      code: "allocate_surplus", severity: "positive",
      title: `Tienes ${f(p.freeToUse)} libres de obligaciones`,
      body: `Después de cubrir los pagos previstos a ${p.committedHorizonDays} días (${f(p.committed)}) y tu colchón (${f(p.buffer)}), quedan ${f(p.freeToUse)} sin destino${p.availableBusiness > 0 ? ` (${f(p.availableBusiness)} de tu disponible está en cuentas de empresa: no lo trates como dinero personal)` : ""}. Asígnalos con intención —reservas fiscales, negocio con retorno medido o patrimonio a largo plazo— o mantenlos en liquidez: no invertir también es una decisión válida si no hay una oportunidad contrastada.`,
      action: "Decidir destino", facts: [{ label: "Libre", value: f(p.freeToUse) }, { label: "Patrimonio neto", value: f(p.netWorth) }],
    };
  }

  return {
    code: "hold", severity: "info",
    title: "Mantén la liquidez y no comprometas capital",
    body: `Tu margen libre tras pagos previstos y colchón es ${f(p.freeToUse)}. Hoy la mejor decisión es conservar el dinero y reducir gasto variable hasta el próximo ingreso.`,
    action: "Ver dashboard", facts: [{ label: "Disponible", value: f(p.available) }, { label: "Comprometido", value: f(p.committed) }],
  };
}
