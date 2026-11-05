# Wealth OS

CFO personal: patrimonio, liquidez, negocios (KYZ) y decisiones financieras justificadas con datos.

**Estado: Fase 1 completa** — autenticación, base de datos con RLS, dashboard, registro de movimientos (formulario y lenguaje natural), calendario de gastos futuros con plan de reserva y proyección de liquidez, cuentas, ajustes, historial de cambios y exportación. Arquitectura y modelo de datos de todas las fases en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com) (región UE recomendada).
2. En *SQL Editor*, ejecuta `supabase/migrations/0001_core.sql` (o `supabase db push` con la CLI).
3. En *Authentication → URL Configuration*, añade `https://tu-dominio/auth/callback` (y `http://localhost:3000/auth/callback`) a las Redirect URLs.
4. Copia `.env.example` a `.env.local` y rellena la URL y la anon key (*Project Settings → API*).
5. `npm install && npm run dev` → http://localhost:3000. Al crear la cuenta se siembran categorías, el negocio KYZ y una cuenta de efectivo.

Despliegue: importa el repo en Vercel y define las mismas variables de entorno (`NEXT_PUBLIC_SITE_URL` = dominio de producción).

## Primeros pasos en la app

1. **Cuentas**: da de alta cada cuenta con su saldo de hoy (corriente, ahorro, inversión, tarjeta, préstamo, cuenta de KYZ). Marca el propósito: *uso diario*, *reserva*, *emergencia*, *fiscal*.
2. **Calendario**: registra todos los pagos que sabes que llegarán (seguros, impuestos, renovaciones, pedidos de fabricación).
3. **Movimientos**: registra cada ingreso/gasto. Escribe frases como «He gastado 45 € en gasolina para KYZ» y confirma.
4. **Ajustes**: define colchón mínimo, meses de fondo de emergencia y objetivo de ingresos.

## Calidad

```bash
npm test          # lógica financiera y parser (Vitest)
npm run db:test   # migraciones + pruebas SQL de RLS, integridad y saldos (requiere PostgreSQL 15+ local)
npm run typecheck
npm run build
```
