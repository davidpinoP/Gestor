import { PageHeader } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { loadPendingTransactions, loadPlanned, loadProfile, loadReference } from "@/lib/data";
import { todayMadrid } from "@/lib/dates";
import { detectClusters, expandPlanned, pendingTxOccurrences, projectLiquidity, reservePlan } from "@/lib/finance/planning";
import { computePosition } from "@/lib/finance/position";
import { requireUser } from "@/lib/supabase/server";
import { CalendarView } from "./calendar-view";

export const metadata = { title: "Calendario financiero" };
const DAYS = 90;

export default async function CalendarioPage() {
  const { supabase } = await requireUser();
  const today = todayMadrid();
  const [profile, ref, pending, planned] = await Promise.all([loadProfile(supabase), loadReference(supabase), loadPendingTransactions(supabase), loadPlanned(supabase)]);
  const active = planned.filter((p) => p.status === "planned" || p.status === "reserved");
  const position = computePosition(ref.accounts, active, pending, profile, today, 30);
  const occ = [...expandPlanned(active, today, addDays(today, 400)), ...pendingTxOccurrences(pending)].sort((a, b) => a.date.localeCompare(b.date));
  const liquidity = position.available + position.reserved;
  const projection = projectLiquidity(liquidity, occ.filter((o) => o.date <= addDays(today, DAYS)), today, DAYS, position.buffer);
  const reserve = reservePlan(occ, position.reserved, today, 365);
  const clusters = detectClusters(occ, liquidity, today, 120);

  return (
    <>
      <PageHeader eyebrow="Gastos e ingresos futuros" title="Calendario financiero" />
      <CalendarView
        today={today}
        planned={planned}
        occurrences={occ}
        projection={projection}
        projectionDays={DAYS}
        reserve={reserve}
        clusters={clusters}
        position={{ available: position.available, reserved: position.reserved, buffer: position.buffer, committed: position.committed }}
      />
    </>
  );
}
