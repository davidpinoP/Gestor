// Dinero siempre en céntimos enteros. Nunca usar floats para sumar importes.

const MAX_CENTS = 99_999_999_999; // < 1.000 millones €, coincide con la restricción SQL

/**
 * Convierte un importe escrito por una persona (formato español o internacional)
 * a céntimos. Devuelve null si no es un importe válido y positivo.
 *   "45" → 4500 · "45,5" → 4550 · "1.234,56" → 123456 · "1,234.56" → 123456 · "45 €" → 4500
 */
export function parseAmountToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return null;
    const c = Math.round(input * 100);
    return c > 0 && c <= MAX_CENTS ? c : null;
  }
  let s = input.trim().replace(/[€\s]|eur(os)?/gi, "");
  if (!s) return null;
  if (/[^0-9.,]/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep: "," | "." | null = null;
  if (lastComma >= 0 && lastDot >= 0) decimalSep = lastComma > lastDot ? "," : ".";
  else if (lastComma >= 0) decimalSep = /,\d{1,2}$/.test(s) ? "," : null;
  else if (lastDot >= 0) {
    // "1.234" es miles en español; "12.5" / "12.50" es decimal.
    const groups = s.split(".");
    const looksLikeThousands = groups.length > 1 && groups.slice(1).every((g) => g.length === 3) && groups[0].length <= 3;
    decimalSep = looksLikeThousands ? null : /\.\d{1,2}$/.test(s) ? "." : null;
    if (decimalSep === null && !looksLikeThousands) return null;
  }

  let intPart = s;
  let decPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    decPart = s.slice(idx + 1);
    if (!/^\d{1,2}$/.test(decPart)) return null;
  }
  if (decimalSep && intPart.includes(decimalSep)) return null;
  // Separadores de miles: grupos de exactamente 3 dígitos.
  if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart || "0")) return null;
  const cents = Number(intPart || "0") * 100 + Number((decPart + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });

export function formatEUR(cents: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const { decimals = true, sign = false } = opts;
  const s = (decimals ? eur : eur0).format(cents / 100);
  return sign && cents > 0 ? `+${s}` : s;
}

export function formatCompactEUR(cents: number): string {
  return `${compact.format(cents / 100)} €`;
}

/** Céntimos → string editable "1234,56" */
export function centsToInput(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function formatPct(ratio: number | null, decimals = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} %`;
}

export const sumCents = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
