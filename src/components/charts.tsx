"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactEUR, formatEUR } from "@/lib/money";
import { formatDay, formatMonth, formatMonthShort } from "@/lib/dates";

const GRID = "rgba(255,255,255,0.05)";
const AXIS = { fontSize: 11, fill: "#6f727a" };
const GOLD = "#c8a96a";
const INCOME = "#b08a3a";
const EXPENSE = "#5a86e0";

function TooltipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: number; color?: string }> }) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-medium text-fg">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-fg-muted">
          <span className="flex items-center gap-1.5">{r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}{r.label}</span>
          <span className="num text-fg">{formatEUR(r.value, { decimals: false })}</span>
        </p>
      ))}
    </div>
  );
}

export function NetWorthChart({ data }: { data: Array<{ month: string; netWorth: number; liquid: number }> }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatCompactEUR(v)} tick={AXIS} axisLine={false} tickLine={false} width={68} />
          <Tooltip cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={formatMonth(String(label))} rows={[{ label: "Patrimonio neto", value: Number(payload[0].payload.netWorth), color: GOLD }, { label: "Liquidez", value: Number(payload[0].payload.liquid) }]} />
            ) : null} />
          <Area animationDuration={500} type="monotone" dataKey="netWorth" stroke={GOLD} strokeWidth={2} fill="url(#nw)" activeDot={{ r: 4, stroke: "#111214", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncomeExpenseChart({ data }: { data: Array<{ month: string; income: number; expense: number }> }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatCompactEUR(v)} tick={AXIS} axisLine={false} tickLine={false} width={68} />
          <Legend verticalAlign="top" align="right" height={24} iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-fg-muted">{v}</span>} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={formatMonth(String(label))} rows={[
                { label: "Ingresos", value: Number(payload[0].payload.income), color: INCOME },
                { label: "Gastos", value: Number(payload[0].payload.expense), color: EXPENSE },
                { label: "Cash flow", value: Number(payload[0].payload.income) - Number(payload[0].payload.expense) },
              ]} />
            ) : null} />
          <Bar animationDuration={500} dataKey="income" name="Ingresos" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar animationDuration={500} dataKey="expense" name="Gastos" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionChart({ data, buffer }: { data: Array<{ date: string; balance: number }>; buffer: number }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis tickFormatter={(v) => formatCompactEUR(v)} tick={AXIS} axisLine={false} tickLine={false} width={68} />
          <ReferenceLine y={0} stroke="#e0645a" strokeOpacity={0.5} />
          {buffer > 0 && <ReferenceLine y={buffer} stroke="#d9a441" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "Colchón", fill: "#d9a441", fontSize: 10, position: "insideTopLeft" }} />}
          <Tooltip cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={formatDay(String(label))} rows={[{ label: "Liquidez proyectada", value: Number(payload[0].value), color: GOLD }]} />
            ) : null} />
          <Line animationDuration={500} type="stepAfter" dataKey="balance" stroke={GOLD} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#111214", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
