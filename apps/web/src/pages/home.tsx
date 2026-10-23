import { useState } from 'react'
import { Link } from 'react-router'
import { ErrorText, Glass, Loading } from '@/components/kit'
import { Icon } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useApi, type Summary } from '@/lib/api'
import { currentMonth, longToday, money } from '@/lib/format'
import { useMovementForm } from './movement-form'
import { MovementsTable } from './movements'
import { PaymentRow, usePaymentToggle } from './payments'
import { PeopleSummary } from './people'

const ACCOUNT_COLORS = ['#0B4F44', '#A9D2C8', '#4FA08F', '#7FB8AA', '#2F7D6D', '#D3E6E0']

function Composition({ title, rows, note }: { title: string; rows: { label: string; amount: number; pct: number; color: string }[]; note?: string }) {
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
        <div key={r.label} className="flex h-9 items-center gap-2.5 lg:h-[38px]">
          <span className="size-3 rounded-[3px]" style={{ background: r.color }} />
          <span className="flex-1 text-sm font-semibold">{r.label}</span>
          <span className="num text-sm font-bold">{money(r.amount)}</span>
          <span className="w-9 text-right text-xs text-muted-foreground lg:w-10">{r.pct}%</span>
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
  const { data: s } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  if (!s) return <Loading />

  const upcoming = s.payments.filter((p) => !p.paid)
  const paidCount = s.payments.length - upcoming.length
  const accounts = s.accounts
    .filter((a) => a.type !== 'credit_card' && a.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((a, i) => ({ label: a.name, amount: a.balance, pct: a.pct ?? 0, color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }))
  const owners = [
    { label: 'Tuya y libre', amount: Math.max(0, s.owners.free), pct: s.owners.freePct, color: '#0F6B5C' },
    { label: 'Para pagos del mes', amount: s.owners.pending, pct: s.owners.pendingPct, color: '#F0C9A4' },
    { label: 'De otras personas', amount: s.owners.others, pct: s.owners.othersPct, color: '#B4540A' },
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
          <div className="text-sm text-brand-soft lg:text-[15px]">de {money(s.totalInAccounts)} en tus cuentas</div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="mt-5 h-11 cursor-pointer rounded-full border border-white/35 bg-white/14 px-5 text-sm font-semibold lg:mt-7"
          >
            {open ? 'Ocultar composición' : 'Ver composición'}
          </button>
        </div>

        {open && (
          <Glass className="flex w-full flex-wrap gap-x-10 gap-y-4 px-[22px] py-5 lg:order-last lg:rounded-[36px] lg:px-9 lg:py-7">
            <Composition title="Por cuenta" rows={accounts} />
            <div className="h-px w-full bg-foreground/8 lg:hidden" />
            <Composition
              title="De quién es"
              rows={owners}
              note={s.cardDebt > 0 ? `La tarjeta (${money(s.cardDebt)}) ya está dentro de los pagos del mes.` : undefined}
            />
          </Glass>
        )}

        <Glass className="min-w-0 flex-[2_1_320px] py-[18px] pr-4 pl-2.5 lg:rounded-[36px] lg:py-6 lg:pr-5 lg:pl-4">
          <div className="flex items-center justify-between pl-3">
            <div className="text-sm font-bold lg:text-[15px]">Próximos pagos</div>
            <Link to="/pagos" className="text-[13px] font-semibold text-brand">
              Ver todos
            </Link>
          </div>
          <div className="mt-1">
            {upcoming.map((p) => (
              <PaymentRow key={`${p.kind}${p.id}`} p={p} busy={toggle.isPending} onToggle={() => toggle.mutate(p)} />
            ))}
          </div>
          {upcoming.length === 0 && <div className="flex min-h-14 items-center pl-3 text-sm text-muted-foreground">No te queda nada por pagar este mes.</div>}
          {paidCount > 0 && (
            <div className="pt-1 pl-3 text-xs text-muted-foreground">
              {paidCount} {paidCount === 1 ? 'pagado' : 'pagados'} este mes
            </div>
          )}
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
