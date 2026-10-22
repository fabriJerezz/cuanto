# Cuánto

Personal money tracker: how much of the money in your accounts is really yours once you subtract this month's pending payments and the money you hold for other people ("plata libre real").

Monorepo with pnpm workspaces:

- `apps/api` — NestJS 12 + TypeORM + SQLite (better-sqlite3). REST API under `/api`.
- `apps/web` — React 19 + Vite + Tailwind v4 + shadcn/ui, TanStack Query, React Router.

## Run

```sh
pnpm install
pnpm dev        # api on :3000, web on :5173 (proxies /api)
pnpm test       # api e2e tests (in-memory SQLite)
pnpm build
```

The database is `apps/api/cuanto.sqlite` (override with `DB_PATH`). The schema is synced on boot; there are no migrations yet. With no accounts the app opens the "Primer uso" onboarding.

## Model

| Entity | Fields | Notes |
| --- | --- | --- |
| `Account` | name, type (`cash`/`bank`/`wallet`/`credit_card`), initialBalance, dueDay | A credit card's balance is negative: its debt. |
| `Person` | name, kind (`person`/`group`) | Balance is derived from movements. |
| `Event` | name, person, closed | Groups shared spending (a trip, a dinner). |
| `Category` | name, monthlyLimit | Budgets. |
| `FixedExpense` | name, amount, dayOfMonth, account | Shows up every month as a pending payment. |
| `Movement` | type (`income`/`expense`/`transfer`), amount, description, date, account, toAccount, category, isOthers, person, relation, event, fixedExpense | |

Derived numbers (see `apps/api/src/ledger.ts`):

- **Account balance** = initial balance + income − expenses ± transfers.
- **Balance with a person** (positive = they owe you): sum over their movements with someone else's money, where an expense adds and an income subtracts.
- **Pending payments** = fixed expenses with no payment movement this month + credit card debt.
- **Plata libre real** = money in non-card accounts − pending payments − what you owe other people.

Amounts are whole pesos.
