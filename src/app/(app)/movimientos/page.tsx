import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { addMonths, endOfMonth, formatMonth, monthKey, todayMadrid } from "@/lib/dates";
import { loadTransactions } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { TransactionsView } from "./transactions-view";

export const metadata = { title: "Movimientos" };

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const today = todayMadrid();
  const key = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : monthKey(today);
  const start = `${key}-01`;
  const { supabase } = await requireUser();
  const txs = await loadTransactions(supabase, start, endOfMonth(start));
  const prev = monthKey(addMonths(start, -1));
  const next = monthKey(addMonths(start, 1));

  return (
    <>
      <PageHeader
        eyebrow="Registro financiero"
        title="Movimientos"
        right={
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-ink-850 p-0.5 text-sm">
            <Link href={`/movimientos?mes=${prev}`} className="rounded-md px-2.5 py-1.5 text-fg-subtle hover:text-fg" aria-label="Mes anterior">←</Link>
            <span className="min-w-36 px-2 text-center font-medium">{formatMonth(key)}</span>
            <Link href={`/movimientos?mes=${next}`} className="rounded-md px-2.5 py-1.5 text-fg-subtle hover:text-fg" aria-label="Mes siguiente">→</Link>
          </div>
        }
      />
      <TransactionsView txs={txs} monthKey={key} />
    </>
  );
}
