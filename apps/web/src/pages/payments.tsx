import { useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { BackTitle, Bar, Caption, ErrorText, Glass, Loading, Muted, PageTitle, Segmented, Tab, segmentClass } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, useApi, useSave, type Account, type CategoryDetail, type Payment, type Summary } from '@/lib/api'
import { currentMonth, localDateTime, money, moneyInput, monthName, parseMoney, shortDate, signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MovementRows } from './movements'

const circle = <circle cx="12" cy="12" r="9" />
function Check({ done }: { done: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {circle}
      {done && <path d="M8 12.5l3 3 5-6" />}
    </svg>
  )
}

const payUrl = (p: Payment) => `/pagos/${p.kind === 'card' ? 'tarjeta' : 'fijo'}/${p.id}`

function PaymentsList({ s }: { s: Summary }) {
  const navigate = useNavigate()
  const toggle = useSave(async (p: Payment) => {
    if (p.paid) return p.movementId && api.del(`/movements/${p.movementId}`)
    return api.post('/movements', {
      type: 'expense',
      amount: p.amount,
      date: localDateTime(),
      accountId: p.accountId,
      fixedExpenseId: p.id,
      description: p.name,
    })
  })
  const pending = s.payments.filter((p) => !p.paid)
  const done = s.payments.filter((p) => p.paid)

  // A card statement needs a source account, so its checkbox opens the payment screen.
  const onToggle = (p: Payment) => (p.kind === 'card' ? !p.paid && navigate(payUrl(p)) : toggle.mutate(p))

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1 pt-1">
        <div className="text-sm font-semibold text-muted-foreground">Te falta pagar</div>
        <div className="num text-[40px] font-bold tracking-[-0.03em]">{money(s.pendingTotal)}</div>
      </div>
      {s.payments.length === 0 && (
        <Muted className="px-1">
          Cargá tus gastos fijos en <Link to="/configuracion" className="font-semibold text-brand">Configuración</Link> y aparecen acá cada mes.
        </Muted>
      )}
      {pending.length > 0 && (
        <Glass className="py-1 pr-3.5 pl-2">
          {pending.map((p) => (
            <div key={`${p.kind}${p.id}`} className="flex min-h-16 items-center gap-1 border-line lg:min-h-[68px] [&+&]:border-t">
              <button
                type="button"
                aria-label={`Marcar como pagado: ${p.name}`}
                disabled={toggle.isPending}
                onClick={() => onToggle(p)}
                className="flex size-12 cursor-pointer items-center justify-center text-muted-foreground"
              >
                <Check done={false} />
              </button>
              <Link to={payUrl(p)} className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">Vence el {shortDate(p.dueDate)}</div>
              </Link>
              <div className="num text-[15px] font-bold">{money(p.amount)}</div>
            </div>
          ))}
        </Glass>
      )}
      {done.length > 0 && (
        <Glass soft className="rounded-[28px] py-1 pr-3.5 pl-2">
          {done.map((p) => (
            <div key={`${p.kind}${p.id}`} className="flex min-h-14 items-center gap-1 border-line [&+&]:border-t">
              <button
                type="button"
                aria-label={`Marcar como pendiente: ${p.name}`}
                disabled={p.kind === 'card' || toggle.isPending}
                onClick={() => onToggle(p)}
                className="flex size-12 cursor-pointer items-center justify-center text-brand disabled:cursor-default"
              >
                <Check done />
              </button>
              <div className="min-w-0 flex-1 text-[15px] font-semibold text-muted-foreground">{p.name}</div>
              <div className="num text-[15px] font-semibold text-muted-foreground">{money(p.amount)}</div>
            </div>
          ))}
        </Glass>
      )}
      <ErrorText error={toggle.error} />
    </div>
  )
}

function Budgets({ s }: { s: Summary }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="px-1 pt-1">
        <div className="text-sm font-semibold text-muted-foreground">Gastado en el mes</div>
        <div className="flex items-baseline gap-2">
          <div className="num text-[40px] font-bold tracking-[-0.03em]">{money(s.budgetSpent)}</div>
          <div className="num text-sm text-muted-foreground">de {money(s.budgetLimit)}</div>
        </div>
      </div>
      {s.budgets.length === 0 && (
        <Muted className="px-1">
          Creá categorías con tope en <Link to="/configuracion" className="font-semibold text-brand">Configuración</Link>.
        </Muted>
      )}
      {s.budgets.length > 0 && (
        <Glass className="px-[22px] py-2 lg:px-6">
          {s.budgets.map((b) => {
            const pct = b.limit ? Math.round((b.spent / b.limit) * 100) : 0
            const warn = pct >= 85
            const left = b.limit - b.spent
            const note = left < 0 ? `Te pasaste ${money(left)}` : warn ? `Quedan ${money(left)}` : `${money(b.spent)} de ${money(b.limit)}`
            return (
              <Link key={b.id} to={`/categorias/${b.id}`} className="block border-line py-3.5 [&+&]:border-t">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <div className="text-[15px] font-semibold">{b.name}</div>
                  <div className={cn('num text-xs', warn ? 'font-bold text-owe-strong' : 'text-muted-foreground')}>{note}</div>
                </div>
                <Bar pct={pct} warn={warn} label={`${b.name}: ${pct}% del presupuesto usado`} />
              </Link>
            )
          })}
        </Glass>
      )}
      {s.eventsWithOthers.count > 0 && (
        <Link to="/personas" className="glass flex min-h-14 items-center justify-between rounded-[28px] px-[22px] text-sm font-semibold shadow-none">
          <span>
            {s.eventsWithOthers.count} {s.eventsWithOthers.count === 1 ? 'evento' : 'eventos'} con plata de otros
          </span>
          <b className="num text-owe">{money(s.eventsWithOthers.amount)}</b>
        </Link>
      )}
    </div>
  )
}

export default function Payments({ tab }: { tab: 'pagos' | 'presupuestos' }) {
  const { data: s } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  if (!s) return <Loading />
  return (
    <>
      <PageTitle>{monthName(s.month)}</PageTitle>
      <Segmented className="lg:hidden">
        <NavLink to="/pagos" end className={({ isActive }) => segmentClass(isActive)}>
          Pagos
        </NavLink>
        <NavLink to="/pagos/presupuestos" className={({ isActive }) => segmentClass(isActive)}>
          Presupuestos
        </NavLink>
      </Segmented>
      <div className="flex flex-wrap items-start gap-7">
        <div className={cn('min-w-0 flex-[1_1_380px]', tab !== 'pagos' && 'hidden lg:block')}>
          <PaymentsList s={s} />
        </div>
        <div className={cn('min-w-0 flex-[1_1_380px]', tab !== 'presupuestos' && 'hidden lg:block')}>
          <Budgets s={s} />
        </div>
      </div>
    </>
  )
}

export function Pay() {
  const { kind, id } = useParams()
  const { data: s } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  const { data: accounts } = useApi<Account[]>('/accounts')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const save = useSave((body: object) => api.post('/movements', body))
  if (!s || !accounts) return <Loading />

  const card = kind === 'tarjeta'
  const p = s.payments.find((x) => x.kind === (card ? 'card' : 'fixed') && x.id === Number(id))
  if (!p) return <Muted>Ese pago no existe.</Muted>

  // A card is paid from a money account; a fixed expense can also go on a card.
  const sources = accounts.filter((a) => !card || a.type !== 'credit_card')
  const acc = sources.find((a) => a.id === (accountId ?? (card ? null : p.accountId))) ?? sources.find((a) => a.type === 'bank') ?? sources[0]
  const n = amount === null ? p.amount : parseMoney(amount)
  const accAfter = acc.balance - n
  const paid = done || p.paid

  const confirm = () =>
    save.mutate(
      card
        ? { type: 'transfer', amount: n, date: localDateTime(), accountId: acc.id, toAccountId: p.id, description: p.name }
        : { type: 'expense', amount: n, date: localDateTime(), accountId: acc.id, fixedExpenseId: p.id, description: p.name },
      { onSuccess: () => setDone(true) },
    )

  return (
    <>
      <BackTitle to="/pagos" label="Pagos">
        {p.name}
      </BackTitle>
      <div className="flex flex-wrap items-start gap-7">
        <Glass className="flex min-w-0 flex-[3_1_420px] flex-col gap-5 p-7 lg:rounded-[36px] lg:p-8">
          <div>
            <div className="text-sm font-semibold text-muted-foreground">
              {p.name} · vence el {shortDate(p.dueDate)}
            </div>
            <div className="num text-5xl leading-[58px] font-bold tracking-[-0.03em]">{money(p.amount)}</div>
          </div>
          <div>
            <Caption>Pagar con</Caption>
            <div className="flex flex-wrap gap-2">
              {sources.map((a) => (
                <Tab key={a.id} active={a.id === acc.id} onClick={() => setAccountId(a.id)} disabled={paid}>
                  {a.name}
                </Tab>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="pg-monto" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
              Monto a pagar
            </label>
            <Input id="pg-monto" inputMode="numeric" disabled={paid} value={`$ ${amount ?? moneyInput(String(p.amount))}`} onChange={(e) => setAmount(moneyInput(e.target.value))} />
          </div>
          <ErrorText error={save.error} />
          <Button className="self-start" disabled={paid || !n || save.isPending} onClick={confirm}>
            {paid ? 'Pagado' : 'Confirmar pago'}
          </Button>
        </Glass>
        <Glass soft className="flex min-w-0 flex-[2_1_300px] flex-col gap-1.5 p-7 lg:rounded-[36px]">
          <div className="text-[15px] font-bold">Cómo queda</div>
          <Muted className="mt-2">{acc.name}</Muted>
          <div className="num text-2xl font-bold">
            {signed(acc.balance)} <span className="text-muted-foreground">→</span> {signed(accAfter)}
          </div>
          {card && (
            <>
              <Muted className="mt-2">Deuda de tarjeta</Muted>
              <div className="num text-2xl font-bold">
                {money(p.amount)} <span className="text-muted-foreground">→</span> <span className="text-brand">{money(Math.max(0, p.amount - n))}</span>
              </div>
            </>
          )}
          <Muted className="mt-3 text-[13px]">
            {card
              ? 'Pagar la tarjeta es una transferencia: baja tu deuda, no suma un gasto nuevo.'
              : 'Queda marcado como pagado este mes y deja de contar en los pagos pendientes.'}
          </Muted>
          {done && <div className="mt-2 text-sm font-bold text-brand">Pago registrado ✓</div>}
        </Glass>
      </div>
    </>
  )
}

export function CategoryPage() {
  const { id } = useParams()
  const { data: c } = useApi<CategoryDetail>(`/categories/${id}?month=${currentMonth()}`)
  const [editing, setEditing] = useState(false)
  const [limit, setLimit] = useState('')
  const save = useSave((monthlyLimit: number) => api.patch(`/categories/${id}`, { monthlyLimit }))
  if (!c) return <Loading />

  const pct = c.monthlyLimit ? Math.round((c.spent / c.monthlyLimit) * 100) : 0
  const left = c.monthlyLimit - c.spent
  const startEdit = () => {
    setLimit(moneyInput(String(c.monthlyLimit)))
    setEditing(!editing)
  }

  return (
    <>
      <BackTitle to="/pagos/presupuestos" label="Pagos y presupuestos" />
      <PageTitle
        action={
          <Button variant="glass" onClick={startEdit}>
            {editing ? 'Cancelar' : 'Editar tope'}
          </Button>
        }
      >
        {c.name}
      </PageTitle>
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-3.5">
          <Glass className="px-[26px] py-6 lg:rounded-[36px] lg:px-8 lg:py-7">
            <div className="text-sm font-semibold text-muted-foreground">Gastado este mes</div>
            <div className="num text-5xl leading-[58px] font-bold tracking-[-0.03em]">{money(c.spent)}</div>
            <Muted className="num">
              de {money(c.monthlyLimit)} · {left < 0 ? 'te pasaste' : 'quedan'} <b className={pct >= 85 ? 'text-owe-strong' : 'text-foreground'}>{money(left)}</b>
            </Muted>
            <Bar className="mt-4" pct={pct} warn={pct >= 85} label={`${pct}% usado`} />
          </Glass>
          {editing && (
            <Glass className="flex flex-col gap-3.5 p-6">
              <div>
                <label htmlFor="ct-tope" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                  Tope mensual
                </label>
                <Input id="ct-tope" inputMode="numeric" value={`$ ${limit}`} onChange={(e) => setLimit(moneyInput(e.target.value))} />
              </div>
              <ErrorText error={save.error} />
              <Button className="self-start" disabled={save.isPending} onClick={() => save.mutate(parseMoney(limit), { onSuccess: () => setEditing(false) })}>
                Guardar
              </Button>
            </Glass>
          )}
        </div>
        <Glass className="min-w-0 flex-[3_1_420px] px-[22px] py-1 lg:px-7">
          <MovementRows movements={c.movements} empty="Sin gastos en esta categoría este mes." />
        </Glass>
      </div>
    </>
  )
}
