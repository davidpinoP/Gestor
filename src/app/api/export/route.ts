import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { loadReference, loadTransactions, loadPlanned, loadProfile } from "@/lib/data";
import { endOfMonth, todayMadrid } from "@/lib/dates";
import { EXPORT_HEADERS, exportRows, safeText, toCSV } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const mes = req.nextUrl.searchParams.get("mes");
  const validMonth = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null;
  const from = validMonth ? `${validMonth}-01` : "1900-01-01";
  const to = validMonth ? endOfMonth(from) : undefined;
  const stamp = validMonth ?? todayMadrid();

  const ref = await loadReference(supabase);

  if (format === "json") {
    // Copia de seguridad completa de los datos del usuario
    const [profile, txs, planned] = await Promise.all([loadProfile(supabase), loadTransactions(supabase, "1900-01-01"), loadPlanned(supabase)]);
    const body = JSON.stringify({ exported_at: new Date().toISOString(), version: 1, profile, ...ref, transactions: txs, planned_items: planned }, null, 2);
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="wealth-os-backup-${stamp}.json"`, "Cache-Control": "no-store" },
    });
  }

  const txs = (await loadTransactions(supabase, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const rows = exportRows(txs, ref);

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Wealth OS";
    const ws = wb.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(EXPORT_HEADERS).font = { bold: true };
    rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === "string" ? safeText(v) : v))));
    [4, 5].forEach((i) => (ws.getColumn(i).numFmt = '#,##0.00 "€";-#,##0.00 "€"'));
    ws.columns.forEach((c) => (c.width = 16));
    ws.getColumn(13).width = 40;
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="movimientos-${stamp}.xlsx"`, "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(toCSV(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="movimientos-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}
