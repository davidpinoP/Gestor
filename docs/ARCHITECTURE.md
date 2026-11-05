# Wealth OS — Arquitectura y modelo de datos

## 1. Principios

1. **Exactitud antes que estética.** Todos los importes son enteros en céntimos (`bigint` en Postgres, `number` entero en TS). Nunca se suman floats.
2. **Una sola fuente de verdad.** Los saldos se derivan de los movimientos (vista `account_balances`); no se guardan saldos "a mano" que puedan desincronizarse.
3. **Sin doble contabilización.** Mover dinero entre cuentas propias es una `transfer`: no es ingreso ni gasto. Pagar la tarjeta o el préstamo es una transferencia hacia esa cuenta de pasivo.
4. **Seguridad por defecto.** RLS en todas las tablas, validación de propiedad de cada clave foránea en triggers, validación con Zod en el servidor y `CHECK` en la base de datos.
5. **La IA recomienda, el usuario autoriza.** Ningún módulo ejecuta operaciones financieras. Las recomendaciones citan siempre los datos de los que salen.
6. **Lógica financiera pura y testeada.** `src/lib/finance/*` no depende de React ni de Supabase: recibe datos, devuelve cálculos. Es lo que en Fase 3 se entrega a la IA como contexto estructurado.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 (App Router, Server Components, Server Actions) + TypeScript estricto |
| Estilos | Tailwind CSS v4, tema oscuro propio (antracita + dorado) |
| Gráficos | Recharts (paleta validada para daltonismo) |
| Datos y auth | Supabase: PostgreSQL + Auth (email/contraseña) + RLS |
| Validación | Zod (servidor) + `CHECK`/triggers (base de datos) |
| Exportación | CSV (formato Excel ES), XLSX (exceljs), JSON (copia completa) |
| Tests | Vitest (lógica financiera, parser) + suite SQL (`npm run db:test`) |
| Despliegue | Vercel + Supabase |

## 3. Estructura

```
supabase/migrations/      Esquema SQL versionado (RLS, triggers, vistas, funciones)
scripts/test-migrations.sh  Aplica migraciones en un Postgres efímero y ejecuta pruebas SQL
src/middleware.ts         Refresco de sesión y protección de rutas
src/lib/
  types.ts                Tipos de dominio
  money.ts / dates.ts     Céntimos, formato es-ES, fechas Europe/Madrid
  nl-parser.ts            Intérprete de lenguaje natural (determinista, Fase 1)
  finance/
    position.ts           Patrimonio, disponible, reservado, comprometido, libre
    history.ts            Patrimonio histórico mensual reconstruido
    metrics.ts            Resúmenes de periodo, tasas, runway, desviaciones
    planning.ts           Recurrencias, plan de reserva, proyección de liquidez, concentraciones
    next-move.ts          Motor de "YOUR NEXT MOVE"
    dashboard.ts          Composición de todo lo anterior
  data.ts                 Lectura desde Supabase (paginada)
  actions/*.ts            Server Actions validadas (escritura)
src/app/(app)/            Dashboard, Movimientos, Calendario, Cuentas, Ajustes
src/app/api/export        Exportación CSV / XLSX / JSON
```

## 4. Definiciones financieras (Fase 1)

| Concepto | Definición |
|---|---|
| Saldo de cuenta | `saldo inicial + ingresos − gastos − transferencias salientes + transferencias entrantes` (sólo pagados, desde `opening_date`) |
| Patrimonio neto | Σ saldos de cuentas incluidas (pasivos con signo negativo) = activos − pasivos |
| Disponible | Liquidez (corriente, ahorro, efectivo) con propósito "uso diario" |
| Reservado | Liquidez con propósito reserva, emergencia o fiscal |
| Comprometido (30 d) | Previsiones de gasto en estado *previsto* + gastos pendientes hasta hoy+30 (incluye vencidos). Lo *reservado* no se descuenta dos veces |
| Libre para usar | Disponible − comprometido − colchón mínimo |
| Cash flow | Ingresos − gastos pagados del periodo |
| Tasa de ahorro | Cash flow ÷ ingresos |
| Tasa de inversión | Transferencias a cuentas de inversión ÷ ingresos |
| Runway | (Liquidez − reserva fiscal) ÷ gasto medio de los 3 últimos meses completos con actividad |
| Ingresos personales (objetivo 10k) | Ingresos personales + transferencias de cuentas de empresa a cuentas personales (retribución del socio) |
| Desviación de categoría | Gasto del mes hasta hoy vs media de los 3 meses anteriores en el **mismo tramo de días** (periodo comparable). Impacto anual = exceso × 12 |
| Plan de reserva | Lo ya reservado se asigna a los pagos más próximos; el resto se divide entre las semanas que faltan hasta cada fecha |
| Proyección de liquidez | Disponible + reservado, aplicando día a día previsiones (y sus repeticiones) y pendientes. No asume ingresos no previstos |

## 5. Modelo de datos

### Fase 1 (implementado — `0001_core.sql`)

| Tabla | Propósito | Campos clave |
|---|---|---|
| `profiles` | Parámetros del usuario | colchón mínimo, meses de fondo de emergencia, objetivo de ingresos |
| `businesses` | Negocios (KYZ sembrado) | nombre, color, activo |
| `accounts` | Cuentas de activo y pasivo | tipo, propósito, ámbito personal/empresa, saldo inicial + fecha |
| `categories` | 2 niveles (categoría/subcategoría) | ámbito, ingreso/gasto, esencial/discrecional |
| `transactions` | Movimientos | tipo (ingreso/gasto/transferencia), estado pagado/pendiente, importe, cuentas, categoría, negocio, método, etiquetas, recurrente, extraordinario, deducibilidad, origen, `external_id` (Open Banking) |
| `planned_items` | Calendario de gastos/ingresos futuros | importe estimado, fecha prevista y límite, prioridad, estado, obligatorio, certeza, recurrencia |
| `audit_log` | Historial inalterable | tabla, registro, acción, `old_data`, `new_data` |
| vista `account_balances` | Saldos derivados | `security_invoker` → respeta RLS |
| fn `settle_planned` | Liquidar previsión atómicamente | crea movimiento, cierra y programa la siguiente repetición |

Integridad: `CHECK` de importes (0 < x < 10⁹ €), forma de transferencias, ámbito/negocio; triggers que impiden referenciar cuentas/categorías/negocios de otro usuario y categorías de tipo incorrecto; borrado lógico (`deleted_at`) para movimientos y previsiones.

### Fase 2 (diseño)

| Tabla | Propósito |
|---|---|
| `assets` / `asset_valuations` | Inmuebles, vehículos, participaciones, otros activos no bancarios con valoraciones fechadas (método y fuente) |
| `liabilities_terms` | Condiciones de deuda: TIN/TAE, cuota, vencimiento (para priorizar amortización) |
| `net_worth_snapshots` | Foto mensual cerrada (activos, pasivos, desglose JSON) para histórico inmutable |
| `goals` | Objetivos editables: tipo (ingreso mensual / patrimonio), importe, fecha deseada |
| `kyz_products` | SKU, PVP de referencia, coste de producción (editable, versionado por fecha) — semilla: HYDROSILK 39,95/4; PROLINE 34,95/3,50; PROLIFT 34,95/3,50; BEAUTYSCULPT 94,95/23 |
| `kyz_orders` / `kyz_order_items` | Ventas con canal, unidades, descuentos, comisiones, envío, devoluciones; enlazadas al movimiento de cobro |
| `kyz_ad_spend` | Gasto publicitario diario por canal/campaña (base para CAC, ROAS) |
| `kyz_inventory_movements` | Entradas/salidas de stock (rotación, capital inmovilizado) |
| `kyz_receivables` | Facturas pendientes de cobro |

### Fase 3 (diseño)

| Tabla | Propósito |
|---|---|
| `ai_reports` | Informes diarios/semanales/mensuales: tipo, periodo, contenido estructurado (JSON), modelo, hash de los datos de entrada |
| `ai_insights` | Hallazgos de comportamiento con cuantificación (importe, periodo comparado, impacto anual) y estado (visto/aceptado/descartado) |
| `allocation_proposals` | Propuestas de Capital Allocation: destino, importe, motivo, riesgos, horizonte, escenarios, confianza, tipo (fundamentada/hipótesis/requiere investigación) y decisión del usuario |
| `ai_conversations` | Conversaciones con el CFO (contexto citado) |

La IA se integrará **sólo en servidor**: la API key vive en variables de entorno de Vercel, nunca en el cliente. Recibe el resultado de `src/lib/finance/*` (cálculos ya hechos y verificables) en lugar de movimientos en bruto, para que no invente cifras: su papel es interpretar, priorizar y redactar.

### Fase 4 (diseño)

| Tabla | Propósito |
|---|---|
| `simulations` | Escenarios guardados (entradas, supuestos, resultados) comparables entre sí |
| `alerts` / `alert_rules` | Alertas con motivo y acción recomendada; reglas configurables (presupuestos, umbrales) |
| `budgets` | Presupuesto mensual por categoría |
| `bank_connections` | Proveedor PSD2 (p. ej. GoCardless Bank Account Data, Tink, Plaid): id de consentimiento, estado, caducidad. **Nunca credenciales bancarias** |
| `bank_import_batches` | Lotes importados; deduplicación por `transactions.external_id` |

Tareas programadas (Supabase Cron / Vercel Cron): análisis diario 07:00 Europe/Madrid, informe semanal domingo 20:00, informe mensual el día 1.

## 6. Seguridad

- Supabase Auth con sesión en cookies httpOnly; `middleware.ts` refresca la sesión y protege todas las rutas; cada Server Action llama a `auth.getUser()` (verificación contra el servidor de auth, no sólo la cookie).
- RLS `user_id = auth.uid()` en todas las tablas; el historial es de sólo lectura para el usuario.
- Las claves foráneas no pasan por RLS → triggers `check_*_refs` validan que cada referencia pertenece al mismo usuario (probado en `scripts/sql/tests.sql`).
- La anon key es pública por diseño; no se usa la service role key en la app.
- Cabeceras: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Exportaciones CSV/XLSX protegidas contra inyección de fórmulas.
- La app no ejecuta transferencias ni operaciones: sólo registra y recomienda.
