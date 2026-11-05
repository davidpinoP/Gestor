import type { ISODate } from "./types";

export const TIMEZONE = "Europe/Madrid";

/** Fecha de hoy en Madrid (YYYY-MM-DD), independiente de la zona del servidor. */
export function todayMadrid(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const toUTC = (d: ISODate) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const fromUTC = (d: Date): ISODate => d.toISOString().slice(0, 10);

export const isValidISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** Suma meses respetando fin de mes (31 ene + 1 mes = 28/29 feb). */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(anchorDay ?? day, last));
  return fromUTC(target);
}

export const daysBetween = (a: ISODate, b: ISODate) => Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);

export const monthKey = (d: ISODate) => d.slice(0, 7); // YYYY-MM
export const startOfMonth = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`;
export function endOfMonth(d: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(d), 1), -1);
}
export const monthStartFromKey = (k: string): ISODate => `${k}-01`;

/** Lista de claves YYYY-MM de los últimos `n` meses, terminando en el mes de `d` (incluido). */
export function lastMonthKeys(d: ISODate, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(addMonths(startOfMonth(d), -i)));
  return out;
}

/** Lunes de la semana ISO de la fecha. */
export function startOfWeek(d: ISODate): ISODate {
  const dow = (toUTC(d).getUTCDay() + 6) % 7; // 0 = lunes
  return addDays(d, -dow);
}

export const dayOfWeekMon0 = (d: ISODate) => (toUTC(d).getUTCDay() + 6) % 7;

const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const formatMonth = (key: string) => cap(monthFmt.format(toUTC(`${key}-01`)));
export const formatMonthShort = (key: string) => monthShortFmt.format(toUTC(`${key}-01`)).replace(".", "");
export const formatDay = (d: ISODate) => dayFmt.format(toUTC(d)).replace(".", "");
export const formatLongDate = (d: ISODate) => cap(longFmt.format(toUTC(d)));

export function relativeDays(from: ISODate, to: ISODate): string {
  const n = daysBetween(from, to);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === -1) return "ayer";
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}
