import { useState } from 'react'
import { Link } from 'react-router'
import { Glass, Loading, Row } from '@/components/kit'
import { Icon } from '@/components/layout'
import { buttonVariants } from '@/components/ui/button'
import { useApi, type Movement, type Summary } from '@/lib/api'
import { amountColor, currentMonth, dayMonth, longToday, money, movementSub, movementTitle, signedMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

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
  const { data: s } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  const { data: latest } = useApi<Movement[]>('/movements?limit=3')
  if (!s) return <Loading />

  const upcoming = s.payments.filter((p) => !p.paid)
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
        <Link to="/movimientos" className={cn(buttonVariants({ size: 'sm' }), 'hidden h-12 px-6 font-bold shadow-[0_10px_24px_rgba(16,32,27,0.22)] lg:inline-flex')}>
          <Icon name="plus" size={20} />
          Nuevo movimiento
        </Link>
      </div>

      <div className="flex flex-wrap items-stretch gap-4 lg:gap-[22px]">
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

        <Glass className="min-w-0 flex-[2_1_320px] px-[22px] pt-[18px] pb-2 lg:rounded-[36px] lg:px-7 lg:pt-6 lg:pb-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold lg:text-[15px]">Próximos pagos</div>
            <Link to="/pagos" className="text-[13px] font-semibold text-brand">
              Ver todos
            </Link>
          </div>
          {upcoming.length === 0 && <Row className="text-sm text-muted-foreground">No te queda nada por pagar este mes.</Row>}
          {upcoming.slice(0, 3).map((p, i) => (
            <Row key={`${p.kind}${p.id}`} className={cn('h-14 justify-between lg:h-16', i === 2 && 'hidden lg:flex')}>
              <div>
                <div className="text-[15px] font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{dayMonth(p.dueDate)}</div>
              </div>
              <div className="num text-[15px] font-bold">{money(p.amount)}</div>
            </Row>
          ))}
        </Glass>
      </div>

      <div className="flex flex-wrap items-start gap-4 lg:gap-[22px]">
        <Glass className="hidden min-w-0 flex-[3_1_420px] px-7 pt-6 pb-3 lg:block lg:rounded-[36px]">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-bold">Últimos movimientos</div>
            <Link to="/movimientos" className="text-[13px] font-semibold text-brand">
              Ver todos
            </Link>
          </div>
          {latest?.length === 0 && <Row className="text-sm text-muted-foreground">Todavía no cargaste movimientos.</Row>}
          {latest?.map((m) => (
            <Row key={m.id} className="h-16 justify-between">
              <Link to={`/movimientos/${m.id}`} className="min-w-0">
                <div className="text-[15px] font-semibold">{movementTitle(m)}</div>
                <div className="text-xs text-muted-foreground">{movementSub(m)}</div>
              </Link>
              <div className={cn('num text-[15px] font-bold', amountColor(m))}>{signedMoney(m)}</div>
            </Row>
          ))}
        </Glass>
        <Link
          to="/personas"
          className="glass flex min-h-14 w-full items-center justify-between rounded-[28px] px-[22px] text-sm font-semibold lg:w-auto lg:flex-[2_1_320px] lg:flex-col lg:items-stretch lg:gap-4 lg:rounded-[36px] lg:px-7 lg:py-6"
        >
          <span className="lg:flex lg:items-baseline lg:justify-between">
            Debés <b className="num text-owe lg:text-2xl">{money(s.owe)}</b>
          </span>
          <span className="lg:flex lg:items-baseline lg:justify-between">
            Te deben <b className="num text-brand lg:text-2xl">{money(s.owed)}</b>
          </span>
        </Link>
      </div>
    </>
  )
}
