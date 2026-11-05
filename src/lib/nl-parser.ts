import { addDays, dayOfWeekMon0, isValidISODate } from "./dates";
import { parseAmountToCents } from "./money";
import type { Account, Business, Category, ISODate, PaymentMethod, Scope, TxKind } from "./types";

export interface ParsedDraft {
  kind: TxKind;
  amount_cents: number | null;
  date: ISODate;
  scope: Scope;
  business_id: string | null;
  category_id: string | null;
  account_id: string | null;
  payment_method: PaymentMethod | null;
  description: string;
  status: "paid" | "pending";
  /** Qué campos se dedujeron y cuáles conviene revisar. */
  notes: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const INCOME_WORDS = ["cobrado", "cobre", "cobro", "he cobrado", "ingreso", "ingresado", "ingresaron", "recibido", "recibi", "me han pagado", "me pagaron", "venta", "vendido", "vendi", "facturado", "nomina", "sueldo", "dividendo", "intereses"];
const PENDING_WORDS = ["pendiente", "tengo que pagar", "debo pagar", "por pagar", "me falta pagar", "pagare", "voy a pagar"];

// palabra clave → nombre de categoría (personal / empresa). Se busca subcategoría y luego raíz.
const PERSONAL_KEYWORDS: Array<[RegExp, string[]]> = [
  [/gasolina|gasoil|diesel|combustible|repostar/, ["Combustible", "Transporte"]],
  [/parking|aparcamiento|peaje/, ["Parking y peajes", "Transporte"]],
  [/seguro del coche|seguro coche/, ["Seguro del coche", "Transporte"]],
  [/taxi|uber|cabify|metro|bus|tren|renfe|transporte/, ["Transporte"]],
  [/super(mercado)?|mercadona|carrefour|lidl|aldi|dia\b|compra semanal|alimentacion|fruta/, ["Supermercado", "Alimentación"]],
  [/restaurante|cena|comida fuera|almuerzo|bar\b|cafe|cafeteria|copas|brunch|menu del dia|glovo|just eat|uber eats/, ["Restaurantes"]],
  [/alquiler|hipoteca/, ["Alquiler/Hipoteca", "Vivienda"]],
  [/luz|agua|gas\b|internet|fibra|movil|telefono|electricidad/, ["Suministros", "Vivienda"]],
  [/cine|concierto|ocio|entradas|fiesta|juego/, ["Ocio"]],
  [/ropa|zapatillas|zara|camiseta|pantalon/, ["Ropa"]],
  [/gimnasio|gym|crossfit|entrenador/, ["Gimnasio"]],
  [/netflix|spotify|suscripcion|hbo|disney|icloud|chatgpt|prime/, ["Suscripciones"]],
  [/viaje|hotel|vuelo|airbnb|booking/, ["Viajes"]],
  [/multa/, ["Multas"]],
  [/farmacia|medico|dentista|salud|fisio/, ["Salud"]],
  [/nomina|sueldo/, ["Nómina"]],
  [/dividendo|intereses/, ["Intereses y dividendos"]],
  [/reembolso|devolucion/, ["Reembolsos"]],
];
const BUSINESS_KEYWORDS: Array<[RegExp, string[]]> = [
  [/publicidad|meta ads|facebook ads|instagram ads|tiktok ads|google ads|anuncio|campana/, ["Publicidad"]],
  [/marketing|influencer|creador|ugc|contenido/, ["Marketing"]],
  [/fabricacion|produccion|pedido de fabricacion|fabrica|materia prima|unidades/, ["Producción"]],
  [/packaging|cajas|embalaje|etiquetas/, ["Packaging"]],
  [/envio|envios|mensajeria|correos|seur|mrw|gls|logistica|almacen/, ["Logística"]],
  [/gasolina|gasoil|diesel|combustible|viaje|hotel|vuelo|tren|dietas/, ["Viajes comerciales"]],
  [/software|shopify|dominio|hosting|saas|licencia|app\b/, ["Software"]],
  [/gestor|asesor|abogado|notario|contable|freelance/, ["Servicios profesionales"]],
  [/iva|irpf|impuesto|hacienda|modelo \d{3}|autonomo|cuota/, ["Impuestos"]],
  [/curso|formacion|mentoria|libro/, ["Formación"]],
  [/sueldo|nomina|empleado|trabajador|seguridad social/, ["Personal"]],
  [/venta|ventas|pedido|vendido|vendi/, ["Ventas"]],
];

const PAYMENT_WORDS: Array<[RegExp, PaymentMethod]> = [
  [/tarjeta|visa|mastercard|amex/, "card"],
  [/efectivo|cash|en mano/, "cash"],
  [/bizum/, "bizum"],
  [/paypal/, "paypal"],
  [/transferencia/, "transfer"],
  [/domiciliad|recibo|domiciliacion/, "direct_debit"],
];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function parseDate(t: string, today: ISODate): { date: ISODate; matched: boolean } {
  if (/\banteayer\b/.test(t)) return { date: addDays(today, -2), matched: true };
  if (/\bayer\b/.test(t)) return { date: addDays(today, -1), matched: true };
  if (/\bmanana\b/.test(t)) return { date: addDays(today, 1), matched: true };
  if (/\bhoy\b/.test(t)) return { date: today, matched: true };
  const year = Number(today.slice(0, 4));
  const m1 = t.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (m1) {
    const y = m1[3] ? (m1[3].length === 2 ? 2000 + Number(m1[3]) : Number(m1[3])) : year;
    const d = `${y}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
    if (isValidISODate(d)) return { date: d, matched: true };
  }
  const m2 = t.match(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")})(?: de (\\d{4}))?`));
  if (m2) {
    const y = m2[3] ? Number(m2[3]) : year;
    const d = `${y}-${String(MONTHS.indexOf(m2[2]) + 1).padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
    if (isValidISODate(d)) return { date: d, matched: true };
  }
  const m3 = t.match(new RegExp(`\\b(?:el )?(${WEEKDAYS.join("|")})(?: pasado)?\\b`));
  if (m3) {
    const target = WEEKDAYS.indexOf(m3[1]);
    let diff = dayOfWeekMon0(today) - target;
    if (diff <= 0) diff += 7;
    return { date: addDays(today, -diff), matched: true };
  }
  return { date: today, matched: false };
}

function extractAmount(raw: string): { cents: number | null; text: string } {
  // Prioridad: número junto a € / euros; si no, el primer número que no sea fecha.
  const withCurrency = raw.match(/(\d[\d.,]*)\s*(?:€|eur\b|euros?\b)/i) ?? raw.match(/€\s*(\d[\d.,]*)/);
  if (withCurrency) return { cents: parseAmountToCents(withCurrency[1]), text: withCurrency[0] };
  const cleaned = raw.replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, " ").replace(/\b\d{1,2} de [a-z]+/gi, " ");
  const m = cleaned.match(/\d[\d.,]*/);
  return m ? { cents: parseAmountToCents(m[0].replace(/[.,]$/, "")), text: m[0] } : { cents: null, text: "" };
}

function findCategory(cats: Category[], names: string[], scope: Scope, kind: "income" | "expense"): Category | undefined {
  for (const n of names) {
    const c = cats.find((x) => !x.archived && x.scope === scope && x.kind === kind && norm(x.name) === norm(n));
    if (c) return c;
  }
  return undefined;
}

export function parseNaturalLanguage(
  input: string,
  ctx: { categories: Category[]; businesses: Business[]; accounts: Account[]; today: ISODate },
): ParsedDraft {
  const raw = input.trim().slice(0, 500);
  const t = norm(raw);
  const notes: string[] = [];

  const { cents } = extractAmount(raw);
  if (cents === null) notes.push("No he encontrado el importe: indícalo.");

  const business = ctx.businesses.find((b) => b.is_active && new RegExp(`\\b${norm(b.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
  const scope: Scope = business ? "business" : "personal";

  const isIncome = INCOME_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(t));
  const kind: "income" | "expense" = isIncome ? "income" : "expense";

  const { date, matched: dateMatched } = parseDate(t, ctx.today);
  if (!dateMatched) notes.push("Fecha no indicada: se usa hoy.");

  let category: Category | undefined;
  for (const [re, names] of scope === "business" ? BUSINESS_KEYWORDS : PERSONAL_KEYWORDS) {
    if (re.test(t)) { category = findCategory(ctx.categories, names, scope, kind); if (category) break; }
  }
  if (!category) notes.push("Categoría no identificada: selecciónala.");

  const payment = PAYMENT_WORDS.find(([re]) => re.test(t))?.[1] ?? null;

  const active = ctx.accounts.filter((a) => !a.archived);
  let account = active.find((a) => a.name.length >= 3 && t.includes(norm(a.name)));
  if (!account && payment === "cash") account = active.find((a) => a.type === "cash" && a.scope === scope) ?? active.find((a) => a.type === "cash");
  if (!account) {
    account =
      active.find((a) => a.scope === scope && (scope === "personal" || a.business_id === business?.id) && a.type === "checking" && a.purpose === "operating") ??
      active.find((a) => a.scope === scope && ["checking", "cash", "credit_card"].includes(a.type)) ??
      active.find((a) => a.type === "checking" && a.purpose === "operating") ??
      active[0];
    if (account) notes.push(`Cuenta supuesta: ${account.name}.`);
  }

  const status = PENDING_WORDS.some((w) => t.includes(w)) ? "pending" : "paid";

  return {
    kind, amount_cents: cents, date, scope, business_id: business?.id ?? null, category_id: category?.id ?? null,
    account_id: account?.id ?? null, payment_method: payment, description: raw.charAt(0).toUpperCase() + raw.slice(1), status, notes,
  };
}
