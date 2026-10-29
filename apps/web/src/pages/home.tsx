import { useState } from 'react'
import { Link } from 'react-router'
import { Collapse, ErrorText, Glass, Loading, useShortcut } from '@/components/kit'
import { Icon } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useApi, type Summary } from '@/lib/api'
import { currentMonth, longToday, money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMovementForm } from './movement-form'
import { MovementsTable } from './movements'
import { MonthRow, usePaymentToggle } from './payments'
import { PeopleSummary } from './people'

const ACCOUNT_ORDER = ['wallet', 'cash', 'bank']
const ACCOUNT_COLORS = ['#0B4F44', '#A9D2C8', '#4FA08F', '#7FB8AA', '#2F7D6D', '#D3E6E0']

interface Row {
  label: string
  amount: number
  pct: number
  color: string
  // Breakdown shown under the row, lighter (e.g. each payment under "Pagos del mes").
  children?: { label: string; amount: number }[]
}

const PENDING = '#F0C9A4' // same warm tones as "De quién es", so the two read together
const OTHERS = '#8FA6BD'

// Per account: the solid part is what you can spend; the warm parts are set aside for payments / other people.
function AccountsComposition({ rows }: { rows: { label: string; balance: number; color: string; split: { free: number; pending: number; others: number } }[] }) {
  return (
    <div className="min-w-0 flex-1 basis-[300px]">
      <div className="text-sm font-bold lg:text-[15px]">Por cuenta</div>
      {rows.map((r) => {
        const { free, pending, others } = r.split
        const short = free < 0
        // Bar parts within the money the account has; when payments exceed it the shortfall is in the number.
        const total = r.balance > 0 ? r.balance : pending + others || 1
        const part = (n: number) => `${(Math.max(0, n) / total) * 100}%`
        const barPending = r.balance > 0 ? Math.min(pending, r.balance - others) : pending
        return (
          <div key={r.label} className="pt-3 lg:pt-3.5">
            <div className="flex items-baseline gap-2.5">
              <span className="size-3 translate-y-px rounded-[3px]" style={{ background: r.color }} />
              <span className="flex-1 text-sm font-semibold">{r.label}</span>
              <span className={cn('num text-sm font-bold', short && 'text-[#8A5A1E]')}>{short ? `− ${money(-free)}` : money(free)}</span>
              <span className="text-xs text-muted-foreground">{short ? 'faltan' : 'libre'}</span>
            </div>
            <div
              role="img"
              aria-label={`${r.label}: ${short ? `faltan ${money(-free)}` : `${money(free)} libre`}, ${money(pending)} para pagos, ${money(others)} de otras personas`}
              className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-md bg-foreground/8"
            >
              <div className="transition-[width] duration-500 ease-apple" style={{ width: part(free), background: r.color }} />
              {barPending > 0 && <div className="transition-[width] duration-500 ease-apple" style={{ width: part(barPending), background: PENDING }} />}
              {others > 0 && <div className="transition-[width] duration-500 ease-apple" style={{ width: part(others), background: OTHERS }} />}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>de {money(r.balance)}</span>
              {pending > 0 && (
                <span className="inline-flex items-center gap-1">
                  <i className="size-2 rounded-[2px]" style={{ background: PENDING }} />
                  Pagos {money(pending)}
                </span>
              )}
              {others > 0 && (
                <span className="inline-flex items-center gap-1">
                  <i className="size-2 rounded-[2px]" style={{ background: OTHERS }} />
                  De otros {money(others)}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Composition({ title, rows: all, note }: { title: string; rows: Row[]; note?: string }) {
  const rows = all.filter((r) => r.pct > 0)
  return (
    <div className="min-w-0 flex-1 basis-[300px]">
      <div className="text-sm font-bold lg:text-[15px]">{title}</div>
      <div
        role="img"
        aria-label={rows.map((r) => `${r.label} ${r.pct}%`).join(', ')}
        className="my-3 flex h-3 gap-0.5 overflow-hidden rounded-md lg:mt-3.5 lg:mb-2 lg:h-3.5"
      >
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${r.pct}%`, background: r.color }} />
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex h-9 items-center gap-2.5 lg:h-[38px]">
            <span className="size-3 rounded-[3px]" style={{ background: r.color }} />
            <span className="flex-1 text-sm font-semibold">{r.label}</span>
            <span className="num text-sm font-bold">{money(r.amount)}</span>
            <span className="w-9 text-right text-xs text-muted-foreground lg:w-10">{r.pct}%</span>
          </div>
          {r.children?.map((c) => (
            <div key={c.label} className="flex h-7 items-center gap-2.5 pl-[22px] opacity-60">
              <span className="flex-1 truncate text-[13px] font-medium">{c.label}</span>
              <span className="num text-[13px] font-semibold">{money(c.amount)}</span>
              <span className="w-9 lg:w-10" />
            </div>
          ))}
        </div>
      ))}
      {note && <div className="mt-2 text-xs leading-[17px] text-muted-foreground">{note}</div>}
    </div>
  )
}

export default function Home() {
  const [open, setOpen] = useState(false)
  const openForm = useMovementForm()
  const toggle = usePaymentToggle()
  // Shortcuts: n toggles the new-movement form, c the composition (d, the debts, lives in PeopleSummary).
  useShortcut('n', () => (openForm.isOpen ? openForm.close() : openForm()), true)
  useShortcut('c', () => setOpen((o) => !o))
  const { data: s } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  if (!s) return <Loading />

  const accounts = s.accounts
    .filter((a) => a.type !== 'credit_card' && (a.balance > 0 || (a.split?.pending ?? 0) > 0))
    // Always billetera, efectivo, banco (then any others), never by amount.
    .sort((a, b) => ACCOUNT_ORDER.indexOf(a.type) - ACCOUNT_ORDER.indexOf(b.type) || a.id - b.id)
    .map((a, i) => ({ label: a.name, balance: a.balance, split: a.split!, color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }))
  const owners = [
    { label: 'Tuya y libre', amount: Math.max(0, s.owners.free), pct: s.owners.freePct, color: '#0F6B5C' },
    {
      label: 'Para pagos del mes',
      amount: s.owners.pending,
      pct: s.owners.pendingPct,
      color: '#F0C9A4',
      children: s.payments.filter((p) => !p.paid && !p.skipped).map((p) => ({ label: p.name, amount: p.amount })),
    },
    { label: 'De otras personas', amount: s.owners.others, pct: s.owners.othersPct, color: '#8FA6BD' },
  ]

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3">
        <div className="text-sm font-semibold text-muted-foreground lg:text-[15px]">{longToday()}</div>
        <Link to="/configuracion" aria-label="Configuración" className="glass flex size-11 items-center justify-center rounded-full shadow-none lg:hidden">
          <Icon name="settings" size={22} />
        </Link>
        <Button size="sm" className="hidden h-12 px-6 font-bold shadow-[0_10px_24px_rgba(16,32,27,0.22)] lg:inline-flex" onClick={() => openForm()}>
          <Icon name="plus" size={20} />
          Nuevo movimiento
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-4 lg:gap-[22px]">
        <div className="hero min-w-0 flex-[3_1_420px] rounded-[32px] px-[26px] pt-7 pb-[22px] lg:rounded-[36px] lg:px-10 lg:pt-9 lg:pb-[30px]">
          <div className="text-sm font-semibold text-brand-soft lg:text-[15px]">Plata libre real</div>
          <div className="num text-5xl leading-[58px] font-bold tracking-[-0.03em] lg:text-[64px] lg:leading-[76px]">
            {s.free < 0 && '− '}
            {money(s.free)}
          </div>
          <div className="text-sm text-brand-soft lg:text-[15px]">
            {s.free < 0 ? `Es lo que te falta para cubrir los pagos pendientes · tenés ${money(s.totalInAccounts)} en tus cuentas` : `de ${money(s.totalInAccounts)} en tus cuentas`}
          </div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="mt-5 h-11 cursor-pointer rounded-full border border-white/35 bg-white/14 px-5 text-sm font-semibold lg:mt-7"
          >
            {open ? 'Ocultar composición' : 'Ver composición'}
          </button>
        </div>

        <Collapse open={open} className="w-full lg:order-last">
          <Glass className="flex w-full flex-wrap gap-x-10 gap-y-4 px-[22px] py-5 lg:rounded-[36px] lg:px-9 lg:py-7">
            <AccountsComposition rows={accounts} />
            <div className="h-px w-full bg-foreground/8 lg:hidden" />
            <Composition
              title="De quién es"
              rows={owners}
              note={s.cardDebt > 0 ? `La tarjeta (${money(s.cardDebt)}) ya está dentro de los pagos del mes.` : undefined}
            />
          </Glass>
        </Collapse>

        <Glass className="min-w-0 flex-[2_1_320px] py-[18px] pr-4 pl-2.5 lg:rounded-[36px] lg:py-6 lg:pr-5 lg:pl-4">
          <div className="flex items-center justify-between pl-3">
            <div className="text-sm font-bold lg:text-[15px]">Pagos del mes</div>
            <Link to="/pagos" className="text-[13px] font-semibold text-brand">
              Ver todos
            </Link>
          </div>
          <div className="mt-1">
            {s.payments.filter((p) => !p.skipped).map((p) => (
              <MonthRow key={`${p.kind}${p.id}`} p={p} busy={toggle.isPending} onToggle={() => toggle.mutate(p)} />
            ))}
          </div>
          {s.payments.every((p) => p.skipped) && <div className="flex min-h-14 items-center pl-3 text-sm text-muted-foreground">No tenés pagos cargados este mes.</div>}
          <ErrorText error={toggle.error} />
        </Glass>
      </div>

      <div className="flex flex-wrap items-start gap-4 lg:gap-[22px]">
        <PeopleSummary owe={s.owe} owed={s.owed} className="w-full lg:order-last lg:w-auto lg:flex-[2_1_320px]" />
        <MovementsTable className="w-full min-w-0 lg:w-auto lg:flex-[3_1_420px]" />
      </div>
    </>
  )
}
