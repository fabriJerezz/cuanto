# Cuánto

Monitor de gastos personal: cuánto de la plata que tenés en tus cuentas es realmente tuya una vez que restás los pagos pendientes del mes y la plata que tenés de otras personas ("plata libre real").

Monorepo con pnpm workspaces:

- `apps/api` — NestJS 12 + TypeORM + SQLite (better-sqlite3). API REST bajo `/api`.
- `apps/web` — React 19 + Vite + Tailwind v4 + shadcn/ui, TanStack Query, React Router.

## Correr

```sh
pnpm install
pnpm dev        # api en :3000, web en :5173 (hace proxy de /api)
pnpm test       # tests e2e de la api (SQLite en memoria)
pnpm build
```

La base de datos es `apps/api/cuanto.sqlite` (se cambia con `DB_PATH`). El esquema se sincroniza al arrancar; todavía no hay migraciones. Sin cuentas cargadas, la app abre el onboarding de "Primer uso".

## Modelo

| Entidad | Campos | Notas |
| --- | --- | --- |
| `Account` | name, type (`cash`/`bank`/`wallet`/`credit_card`), initialBalance, dueDay | El saldo de una tarjeta de crédito es negativo: es su deuda. |
| `Person` | name, kind (`person`/`group`) | El saldo se calcula a partir de los movimientos. |
| `Event` | name, person, closed | Agrupa gastos compartidos (un viaje, una cena). |
| `Category` | name, monthlyLimit | Presupuestos. |
| `FixedExpense` | name, amount, dayOfMonth, account | Aparece todos los meses como pago pendiente. |
| `Movement` | type (`income`/`expense`/`transfer`), amount, description, date, account, toAccount, category, isOthers, person, relation, event, fixedExpense | |

Números derivados (ver `apps/api/src/ledger.ts`):

- **Saldo de una cuenta** = saldo inicial + ingresos − egresos ± transferencias.
- **Saldo con una persona** (positivo = te debe): suma de sus movimientos con plata de otros, donde un egreso suma y un ingreso resta.
- **Pagos pendientes** = gastos fijos sin movimiento de pago este mes + deuda de la tarjeta.
- **Plata libre real** = plata en cuentas que no son tarjeta − pagos pendientes − lo que le debés a otras personas.

Los montos son pesos enteros.
