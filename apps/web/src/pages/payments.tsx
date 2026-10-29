import { CalendarX2 } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useParams } from 'react-router'
import { BackTitle, Bar, Caption, Chip, ErrorText, Glass, Label, Loading, Muted, PageTitle, Segmented, Tab, Collapse, segmentClass, tabClass } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { api, useApi, useSave, type Account, type CategoryDetail, type Payment, type Summary } from '@/lib/api'
import { currentMonth, dueState, localDateTime, money, moneyInput, monthName, parseMoney, shortDate, signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ShortNote } from '@/components/short-note'
import { notify } from '@/components/toast'
import { MovementRows } from './movements'
import { Manager } from './settings'

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

// Ticking a fixed expense pays it with its own account; ticking the card statement pays the
// whole debt from the bank (the payment screen lets you pick another account or amount).
// Tells you when the account can't cover what you just paid (its balance goes negative).
export function warnIfShort(account: Account | undefined, amount: number) {
  if (account && account.type !== 'credit_card' && account.balance < amount)
    notify(`${account.name} queda en negativo: tenía ${signed(account.balance)} y el pago es de ${money(amount)}.`)
}

export function usePaymentToggle() {
  const { data: accounts } = useApi<Account[]>('/accounts')
  const save = useSave(async (p: Payment) => {
    if (p.paid) return p.movementId && api.del(`/movements/${p.movementId}`)
    const base = { amount: p.amount, date: localDateTime(), description: p.name }
    if (p.kind === 'fixed') {
      const done = await api.post('/movements', { ...base, type: 'expense', accountId: p.accountId, fixedExpenseId: p.id, eventId: p.eventId })
      warnIfShort(accounts?.find((a) => a.id === p.accountId), p.amount)
      return done
    }
    const money = accounts?.filter((a) => a.type !== 'credit_card') ?? []
    const from = money.find((a) => a.type === 'bank') ?? money[0]
    if (!from) throw new Error('Necesitás una cuenta para pagar la tarjeta')
    const done = await api.post('/movements', { ...base, type: 'transfer', accountId: from.id, toAccountId: p.id })
    warnIfShort(from, p.amount)
    return done
  })
  return save
}

const TONE = {
  overdue: { row: 'bg-owe/9', sub: 'font-bold text-owe-strong' },
  soon: { row: 'bg-brand/7', sub: 'font-semibold text-brand-dark' },
  later: { row: '', sub: 'text-muted-foreground' },
}

export function PaymentRow({ p, onToggle, busy }: { p: Payment; onToggle: () => void; busy: boolean }) {
  if (p.paid)
    return (
      <div className="flex min-h-14 items-center gap-1 border-line px-2 pr-3.5 [&+&]:border-t">
        <button
          type="button"
          aria-label={`Marcar como pendiente: ${p.name}`}
          disabled={p.kind === 'card' || busy}
          onClick={onToggle}
          className="flex size-12 shrink-0 cursor-pointer items-center justify-center text-brand disabled:cursor-default"
        >
          <Check done />
        </button>
        <div className="min-w-0 flex-1 text-[15px] font-semibold text-muted-foreground">{p.name}</div>
        <div className="num text-[15px] font-semibold text-muted-foreground">{money(p.amount)}</div>
      </div>
    )
  const due = dueState(p.dueDate)
  return (
    <div className={cn('flex min-h-16 items-center gap-1 rounded-[22px] px-2 pr-3.5 [&+&]:mt-1 lg:min-h-[68px] lg:rounded-[26px]', TONE[due.tone].row)}>
      <button
        type="button"
        aria-label={`Marcar como pagado: ${p.name}`}
        disabled={busy}
        onClick={onToggle}
        className={cn('flex size-12 shrink-0 cursor-pointer items-center justify-center', due.tone === 'overdue' ? 'text-owe' : 'text-muted-foreground')}
      >
        <Check done={false} />
      </button>
      <Link to={payUrl(p)} className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{p.name}</div>
        <div className={cn('text-xs', TONE[due.tone].sub)}>{due.label}</div>
      </Link>
      <div className="num pr-2 text-[15px] font-bold">{money(p.amount)}</div>
    </div>
  )
}

// Home list: every payment of the month in one row that stays mounted when ticked, so the
// circle fills, the tick draws and the name strikes through instead of jumping lists.
export function MonthRow({ p, onToggle, busy }: { p: Payment; onToggle: () => void; busy: boolean }) {
  const due = p.paid ? null : dueState(p.dueDate)
  const skip = useSave(() => api.put(`/fixed-expenses/${p.id}/skip/${currentMonth()}`))
  const row = (
    <div className={cn('-mx-1 my-0.5 flex min-h-16 items-center gap-1 rounded-[20px] px-1 transition-colors duration-500 ease-apple lg:min-h-[68px]', due && TONE[due.tone].row)}>
      <button
        type="button"
        aria-label={`${p.paid ? 'Marcar como pendiente' : 'Marcar como pagado'}: ${p.name}`}
        aria-pressed={p.paid}
        disabled={(p.paid && p.kind === 'card') || busy}
        onClick={onToggle}
        className={cn('flex size-12 shrink-0 cursor-pointer items-center justify-center transition-colors duration-300 disabled:cursor-default', p.paid ? 'text-brand' : due?.tone === 'overdue' ? 'text-owe' : 'text-muted-foreground')}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={p.paid ? 1 : 0} className="transition-[fill-opacity] duration-300 ease-apple" />
          <path
            d="M8 12.5l3 3 5-6"
            pathLength={1}
            stroke="white"
            strokeDasharray={1}
            strokeDashoffset={p.paid ? 0 : 1}
            className="transition-[stroke-dashoffset] duration-300 ease-apple"
            style={{ transitionDelay: p.paid ? '120ms' : '0ms' }}
          />
        </svg>
      </button>
      <Link to={payUrl(p)} className="min-w-0 flex-1">
        <div className={cn('relative w-fit max-w-full text-[15px] font-semibold transition-colors duration-500 ease-apple', p.paid && 'text-muted-foreground')}>
          {p.name}
          <span
            aria-hidden="true"
            className={cn('absolute top-1/2 left-0 h-[1.5px] w-full origin-left bg-current transition-transform duration-500 ease-apple', p.paid ? 'scale-x-100' : 'scale-x-0')}
          />
        </div>
        <div className={cn('text-xs transition-colors duration-500', due ? TONE[due.tone].sub : 'text-muted-foreground')}>{due ? due.label : 'Pagado'}</div>
      </Link>
      <div className={cn('num pr-2 text-[15px] transition-colors duration-500', p.paid ? 'font-semibold text-muted-foreground' : 'font-bold')}>{money(p.amount)}</div>
    </div>
  )
  // Only an unpaid fixed expense can sit a month out.
  if (p.paid || p.kind !== 'fixed') return row
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => skip.mutate()}>
          <CalendarX2 /> Este mes no
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// A payment for this month only: it doesn't repeat next month.
function AddOneOff() {
  const { data: accounts } = useApi<Account[]>('/accounts')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(String(new Date().getDate()))
  const [accountId, setAccountId] = useState<number | null>(null)
  const sources = (accounts ?? []).filter((a) => a.type !== 'credit_card')
  const acc = sources.find((a) => a.id === accountId) ?? sources.find((a) => a.type === 'wallet') ?? sources[0]
  const n = parseMoney(amount)
  const save = useSave(() =>
    api.post('/fixed-expenses', { name: name.trim(), amount: n, dayOfMonth: Math.min(31, Math.max(1, Number(day) || 1)), accountId: acc!.id, month: currentMonth() }),
  )
  const ready = !!name.trim() && n > 0 && !!acc

  return (
    <div>
      <Button variant="glass" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Cancelar' : 'Agregar pago de este mes'}
      </Button>
      <Collapse open={open}>
        <Glass className="mt-3 flex flex-col gap-3 p-5">
          <div>
            <Label htmlFor="op-name">Nombre</Label>
            <Input id="op-name" placeholder="Ej: Regalo de cumpleaños" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2.5">
            <div className="flex-[2]">
              <Label htmlFor="op-amount">Monto</Label>
              <Input id="op-amount" inputMode="numeric" placeholder="$ 0" value={amount ? `$ ${amount}` : ''} onChange={(e) => setAmount(moneyInput(e.target.value))} />
            </div>
            <div className="flex-1">
              <Label htmlFor="op-day">Día</Label>
              <Input id="op-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
          </div>
          <div>
            <Caption>Se paga con</Caption>
            <div className="flex flex-wrap gap-2">
              {sources.map((a) => (
                <Chip key={a.id} active={a.id === acc?.id} onClick={() => setAccountId(a.id)}>
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>
          <ShortNote accountId={acc?.id} amount={n} />
          <ErrorText error={save.error} />
          <Button
            className="self-start"
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false)
                  setName('')
                  setAmount('')
                },
              })
            }
          >
            Agregar
          </Button>
        </Glass>
      </Collapse>
    </div>
  )
}

function PaymentsList({ s }: { s: Summary }) {
  const toggle = usePaymentToggle()
  const pending = s.payments.filter((p) => !p.paid && !p.skipped)
  const done = s.payments.filter((p) => p.paid)
  const skipped = s.payments.filter((p) => p.skipped)
  const include = useSave((p: Payment) => api.del(`/fixed-expenses/${p.id}/skip/${currentMonth()}`))

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1 pt-1">
        <div className="text-sm font-semibold text-muted-foreground">Te falta pagar</div>
        <div className="num text-[40px] font-bold tracking-[-0.03em]">{money(s.pendingTotal)}</div>
      </div>
      {s.payments.length === 0 && (
        <Muted className="px-1">
          Cargá tus gastos fijos más abajo y aparecen acá cada mes.
        </Muted>
      )}
      {pending.length > 0 && (
        <Glass className="p-1.5">
          {pending.map((p) => (
            <PaymentRow key={`${p.kind}${p.id}`} p={p} busy={toggle.isPending} onToggle={() => toggle.mutate(p)} />
          ))}
        </Glass>
      )}
      {done.length > 0 && (
        <Glass soft className="p-1.5">
          {done.map((p) => (
            <PaymentRow key={`${p.kind}${p.id}`} p={p} busy={toggle.isPending} onToggle={() => toggle.mutate(p)} />
          ))}
        </Glass>
      )}
      {skipped.length > 0 && (
        <Glass soft className="rounded-[28px] py-1 pr-3.5 pl-4">
          <div className="pt-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">Este mes no</div>
          {skipped.map((p) => (
            <div key={p.id} className="flex min-h-14 items-center gap-3 border-line [&+&]:border-t">
              <div className="min-w-0 flex-1 text-[15px] font-semibold text-muted-foreground">{p.name}</div>
              <div className="num text-[15px] text-muted-foreground">{money(p.amount)}</div>
              <Button variant="ghost" size="sm" disabled={include.isPending} onClick={() => include.mutate(p)}>
                Incluir
              </Button>
            </div>
          ))}
        </Glass>
      )}
      <AddOneOff />
      <ErrorText error={toggle.error ?? include.error} />
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
          Creá categorías con tope en <Link to="/pagos/categorias" className="font-semibold text-brand">Categorías</Link>.
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
        <Link to="/pagos/eventos" className="glass flex min-h-14 items-center justify-between rounded-[28px] px-[22px] text-sm font-semibold shadow-none">
          <span>
            {s.eventsWithOthers.count} {s.eventsWithOthers.count === 1 ? 'evento' : 'eventos'} con plata de otros
          </span>
          <b className="num text-owe">{money(s.eventsWithOthers.amount)}</b>
        </Link>
      )}
    </div>
  )
}

const MANAGE = { eventos: 'Eventos', categorias: 'Categorías' } as const
const SECTION_OF = { eventos: 'eventos', categorias: 'cats' } as const

export default function Payments({ tab }: { tab: 'pagos' | 'presupuestos' | keyof typeof MANAGE }) {
  const { data: s } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  if (!s) return <Loading />
  return (
    <>
      <PageTitle>{monthName(s.month)}</PageTitle>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <NavLink to="/pagos" end={false} className={() => tabClass(tab === 'pagos' || tab === 'presupuestos')}>
          Gastos
        </NavLink>
        {(Object.keys(MANAGE) as (keyof typeof MANAGE)[]).map((k) => (
          <NavLink key={k} to={`/pagos/${k}`} className={() => tabClass(tab === k)}>
            {MANAGE[k]}
          </NavLink>
        ))}
      </div>
      {tab in MANAGE ? (
        <Manager key={tab} sectionId={SECTION_OF[tab as keyof typeof MANAGE]} />
      ) : (
        <>
        <Segmented className="lg:hidden">
          <NavLink to="/pagos" end className={({ isActive }) => segmentClass(isActive)}>
            Gastos
          </NavLink>
          <NavLink to="/pagos/presupuestos" className={({ isActive }) => segmentClass(isActive)}>
            Presupuestos
          </NavLink>
        </Segmented>
        <div className="flex flex-wrap items-start gap-7">
          <div className={cn('min-w-0 flex-[1_1_380px]', tab !== 'pagos' && 'hidden lg:block')}>
            <PaymentsList s={s} />
            <div className="mt-9 flex flex-col gap-4">
              <div className="px-1 text-[17px] font-bold">Gastos fijos</div>
              <Manager sectionId="fijos" />
            </div>
          </div>
          <div className={cn('min-w-0 flex-[1_1_380px]', tab !== 'presupuestos' && 'hidden lg:block')}>
            <Budgets s={s} />
          </div>
        </div>
        </>
      )}
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
        : { type: 'expense', amount: n, date: localDateTime(), accountId: acc.id, fixedExpenseId: p.id, eventId: p.eventId, description: p.name },
      {
        onSuccess: () => {
          warnIfShort(acc, n)
          setDone(true)
        },
      },
    )

  return (
    <>
      <BackTitle to="/pagos" label="Gastos">
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
      <BackTitle to="/pagos/presupuestos" label="Gastos y presupuestos" />
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
          <Collapse open={editing}>
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
          </Collapse>
        </div>
        <Glass className="min-w-0 flex-[3_1_420px] px-[22px] py-1 lg:px-7">
          <MovementRows movements={c.movements} empty="Sin gastos en esta categoría este mes." amountOf={(m) => m.myShare} />
        </Glass>
      </div>
    </>
  )
}
