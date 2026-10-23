import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackTitle, Bar, Caption, ErrorText, Glass, Label, Loading, Muted, Tab } from '@/components/kit'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, useApi, useSave, type Account, type EventDetail, type Person, type PersonDetail, type PersonRow } from '@/lib/api'
import { balanceDir, daysAgo, initials, listNames, localDateTime, money, signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMovementForm } from './movement-form'
import { MovementRows } from './movements'

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/12 text-sm font-bold text-brand-dark">{initials(name)}</div>
  )
}

function BalanceLine({ p, sub, to, action }: { p: Person & { balance: number }; sub?: string; to?: string; action?: React.ReactNode }) {
  const body = (
    <>
      <Avatar name={p.name} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{p.name}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className="text-right">
        <div className={cn('num text-[15px] font-bold', p.balance < 0 ? 'text-owe' : p.balance > 0 ? 'text-brand' : 'text-muted-foreground')}>{money(p.balance)}</div>
        <div className="text-xs text-muted-foreground">{balanceDir(p.balance, p)}</div>
      </div>
    </>
  )
  const cls = 'flex min-h-[68px] items-center gap-3.5 border-line [&+&]:border-t'
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>
      {body}
      {action}
    </div>
  )
}

// Inicio: what you owe and are owed, unfolding into the people involved.
export function PeopleSummary({ owe, owed, className }: { owe: number; owed: number; className?: string }) {
  const [open, setOpen] = useState(false)
  const { data: people } = useApi<PersonRow[]>(open ? '/people' : null)
  const involved = people?.filter((p) => p.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  const even = people?.filter((p) => p.balance === 0).map((p) => p.name) ?? []

  return (
    <Glass className={cn('px-[22px] py-4 lg:rounded-[36px] lg:px-7 lg:py-6', className)}>
      <div className="flex flex-col gap-2 text-sm font-semibold">
        <div className="flex items-baseline justify-between">
          <span>Debés</span>
          <b className="num text-xl text-owe lg:text-2xl">{money(owe)}</b>
        </div>
        <div className="flex items-baseline justify-between">
          <span>Te deben</span>
          <b className="num text-xl text-brand lg:text-2xl">{money(owed)}</b>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-3 h-10 w-full cursor-pointer rounded-full border border-white/90 bg-white/52 text-sm font-semibold"
      >
        {open ? 'Ocultar personas' : 'Ver personas'}
      </button>
      {open && (
        <div className="mt-2">
          {!people && <Loading />}
          {involved?.map((p) => {
            const ago = p.lastMovementDate ? daysAgo(p.lastMovementDate) : 0
            return <BalanceLine key={p.id} p={p} to={`/personas/${p.id}`} sub={[p.eventName, ago >= 7 && `hace ${ago} días`].filter(Boolean).join(' · ')} />
          })}
          {involved?.length === 0 && <Muted className="py-3 text-center">No le debés a nadie ni te deben.</Muted>}
          {even.length > 0 && (
            <div className="pt-2 text-center text-[13px] text-muted-foreground">
              {listNames(even)} {even.length === 1 ? 'está' : 'están'} a mano
            </div>
          )}
        </div>
      )}
    </Glass>
  )
}

// Shared by people and events: balance card with "te pasó X, gastaste Y".
function BalanceCard({ balance, received, spent, group, context }: { balance: number; received: number; spent: number; group: boolean; context?: string }) {
  const title = balance < 0 ? (group ? 'Les debés' : 'Le debés') : balance > 0 ? (group ? 'Te deben' : 'Te debe') : 'Están a mano'
  const pct = received ? Math.round((spent / received) * 100) : 0
  return (
    <Glass className="px-[26px] py-6 lg:rounded-[36px] lg:px-8 lg:py-7">
      <div className="text-sm font-semibold text-muted-foreground">{title}</div>
      <div className={cn('num text-5xl leading-[58px] font-bold tracking-[-0.03em]', balance < 0 ? 'text-owe' : balance > 0 ? 'text-brand' : '')}>
        {money(balance)}
      </div>
      {received > 0 && (
        <>
          <Muted>
            {[context, `te ${group ? 'pasaron' : 'pasó'} ${money(received)}, se gastó ${money(spent)}`].filter(Boolean).join(' · ')}
          </Muted>
          <Bar className="mt-4" pct={pct} label={`${pct}% rendido`} />
        </>
      )}
    </Glass>
  )
}

export function PersonPage() {
  const { id } = useParams()
  const openForm = useMovementForm()
  const { data: p } = useApi<PersonDetail>(`/people/${id}`)
  if (!p) return <Loading />
  const group = p.kind === 'group'
  const openEvent = p.events.find((e) => !e.closed)
  return (
    <>
      <BackTitle to="/" label="Inicio">
        {p.name}
      </BackTitle>
      <h1 className="hidden text-[28px] font-bold tracking-[-0.02em] lg:block">{p.name}</h1>
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-4">
          <BalanceCard balance={p.balance} received={p.received} spent={p.spent} group={group} context={openEvent?.name} />
          <div className="flex gap-2.5">
            <Link to={`/personas/${p.id}/saldar`} className={cn(buttonVariants(), 'flex-1')}>
              {p.balance > 0 ? (group ? 'Me devolvieron' : 'Me devolvió') : group ? 'Les devolví' : 'Le devolví'}
            </Link>
            <Button variant="glass" className="flex-1" onClick={() => openForm({ personId: p.id })}>
              Nuevo movimiento
            </Button>
          </div>
          {p.events.length > 0 && (
            <div>
              <Caption>Eventos</Caption>
              <div className="flex flex-wrap gap-2">
                {p.events.map((e) => (
                  <Link
                    key={e.id}
                    to={`/eventos/${e.id}`}
                    className="inline-flex h-11 items-center rounded-full border border-white/90 bg-white/52 px-[18px] text-sm font-semibold"
                  >
                    {e.name}
                    {e.closed && ' · cerrado'}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        <Glass className="min-w-0 flex-[3_1_420px] px-[22px] py-1 lg:px-7">
          <MovementRows movements={p.movements} empty="Sin movimientos." amountOf={(m) => m.share} />
        </Glass>
      </div>
    </>
  )
}

const PARTS = [
  [1, 'Todo'],
  [0.5, 'La mitad'],
  [0.25, 'Un cuarto'],
] as const

export function Settle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: p } = useApi<PersonDetail>(`/people/${id}`)
  const { data: accounts } = useApi<Account[]>('/accounts')
  const [dir, setDir] = useState<'dev' | 'rec' | null>(null)
  const [part, setPart] = useState<number>(1)
  const [accountId, setAccountId] = useState<number | null>(null)
  const save = useSave((body: object) => api.post('/movements', body))
  if (!p || !accounts) return <Loading />

  const group = p.kind === 'group'
  const d = dir ?? (p.balance > 0 ? 'rec' : 'dev')
  const dev = d === 'dev'
  const debt = Math.abs(p.balance)
  const amount = Math.round(debt * part)
  const money_accounts = accounts.filter((a) => a.type !== 'credit_card')
  const acc = money_accounts.find((a) => a.id === accountId) ?? money_accounts.find((a) => a.type === 'bank') ?? money_accounts[0]
  // Paying back reduces what you owe; being paid back reduces what they owe.
  const after = p.balance + (dev ? amount : -amount)

  const title = dev ? `${group ? 'Les' : 'Le'} devolví a ${p.name}` : `${p.name} me ${group ? 'devolvieron' : 'devolvió'}`
  const confirm = () =>
    save.mutate(
      {
        type: dev ? 'expense' : 'income',
        amount,
        date: localDateTime(),
        accountId: acc.id,
        isOthers: true,
        personId: p.id,
        relation: dev ? 'returned' : 'returned_to_me',
        description: title,
      },
      { onSuccess: () => navigate(`/personas/${p.id}`) },
    )

  return (
    <>
      <BackTitle to={`/personas/${p.id}`} label={p.name}>
        {title}
      </BackTitle>
      <h1 className="hidden text-[28px] font-bold tracking-[-0.02em] lg:block">{title}</h1>
      <div className="flex flex-wrap items-start gap-7">
        <Glass className="flex min-w-0 flex-[3_1_420px] flex-col gap-5 p-7 lg:rounded-[36px] lg:p-8">
          <div className="flex flex-wrap gap-2">
            <Tab active={dev} onClick={() => setDir('dev')}>
              {group ? 'Les devolví' : 'Le devolví'}
            </Tab>
            <Tab active={!dev} onClick={() => setDir('rec')}>
              {group ? 'Me devolvieron' : 'Me devolvió'}
            </Tab>
          </div>
          <div>
            <Caption>Monto</Caption>
            <div className="num text-5xl leading-[58px] font-bold tracking-[-0.03em]">{money(amount)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PARTS.map(([v, label]) => (
                <Tab key={v} active={part === v} onClick={() => setPart(v)}>
                  {label}
                </Tab>
              ))}
            </div>
          </div>
          <div>
            <Caption>{dev ? 'Pagué desde' : 'Entró a'}</Caption>
            <div className="flex flex-wrap gap-2">
              {money_accounts.map((a) => (
                <Tab key={a.id} active={a.id === acc?.id} onClick={() => setAccountId(a.id)}>
                  {a.name}
                </Tab>
              ))}
            </div>
          </div>
          <ErrorText error={save.error} />
          <Button disabled={!amount || !acc || save.isPending} onClick={confirm} className="self-start">
            Confirmar
          </Button>
        </Glass>
        <Glass soft className="flex min-w-0 flex-[2_1_300px] flex-col gap-1.5 p-7 lg:rounded-[36px]">
          <div className="text-[15px] font-bold">Cómo queda</div>
          <Muted className="mt-2">Cuenta con {p.name}</Muted>
          <div className="num text-2xl font-bold">
            {money(p.balance)} <span className="text-muted-foreground">→</span> <span className="text-brand">{money(after)}</span>
          </div>
          {acc && (
            <>
              <Muted className="mt-2">{acc.name}</Muted>
              <div className="num text-2xl font-bold">
                {signed(acc.balance)} <span className="text-muted-foreground">→</span> {signed(acc.balance + (dev ? -amount : amount))}
              </div>
            </>
          )}
          <Muted className="mt-3 text-[13px]">
            {dev
              ? 'Devolver plata de otros no es un gasto tuyo: baja lo que debés y tu plata libre real se mantiene.'
              : `Si ${p.name} te devuelve algo que adelantaste, cuenta como plata tuya.`}
          </Muted>
        </Glass>
      </div>
    </>
  )
}

const NEW = '__new'

function AddParticipant({ event }: { event: EventDetail }) {
  const { data: people } = useApi<Person[]>('/people')
  const [pick, setPick] = useState('')
  const [name, setName] = useState('')
  const add = useSave(async () => {
    const id = pick === NEW ? (await api.post<Person>('/people', { name: name.trim() })).id : Number(pick)
    await api.patch(`/events/${event.id}`, { personIds: [...event.people.map((p) => p.id), id] })
  })
  const options = people?.filter((p) => !event.people.some((x) => x.id === p.id)) ?? []
  const ready = pick === NEW ? !!name.trim() : !!pick

  return (
    <div className="flex flex-col gap-2.5 pt-3">
      <Label htmlFor="sumar">Sumar persona</Label>
      <div className="flex gap-2">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger id="sumar" className="flex-1">
            <SelectValue placeholder="Elegí una persona" />
          </SelectTrigger>
          <SelectContent>
            {options.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW}>+ Persona nueva…</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="icon"
          className="size-[52px]"
          aria-label="Sumar"
          disabled={!ready || add.isPending}
          onClick={() =>
            add.mutate(undefined, {
              onSuccess: () => {
                setPick('')
                setName('')
              },
            })
          }
        >
          <Plus />
        </Button>
      </div>
      {pick === NEW && <Input aria-label="Nombre de la persona nueva" placeholder="Ej: Fede" value={name} onChange={(e) => setName(e.target.value)} />}
      <ErrorText error={add.error} />
    </div>
  )
}

export function EventPage() {
  const { id } = useParams()
  const openForm = useMovementForm()
  const { data: e } = useApi<EventDetail>(`/events/${id}`)
  const update = useSave((body: object) => api.patch(`/events/${id}`, body))
  if (!e) return <Loading />

  const many = e.people.length > 1 || e.people[0]?.kind === 'group'
  const pct = e.received ? Math.round((e.spent / e.received) * 100) : 0
  const title = e.balance < 0 ? (many ? 'Les debés' : 'Le debés') : e.balance > 0 ? (many ? 'Te deben' : 'Te debe') : 'Quedó en cero'
  const names = e.people.length ? listNames(e.people.map((p) => p.name)) : 'Sin personas'
  const single = e.people.length === 1 ? e.people[0] : null

  return (
    <>
      <BackTitle to="/configuracion?seccion=eventos" label="Eventos">
        {e.name}
      </BackTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="hidden text-[28px] font-bold tracking-[-0.02em] lg:block">{e.name}</h1>
          <Muted>
            {names} · {e.closed ? 'cerrado' : 'abierto'}
          </Muted>
        </div>
        <Button variant="glass" disabled={update.isPending} onClick={() => update.mutate({ closed: !e.closed })}>
          {e.closed ? 'Reabrir evento' : 'Cerrar evento'}
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-3.5">
          <Glass className="px-[26px] py-6 lg:rounded-[36px] lg:px-8 lg:py-7">
            <div className="text-sm font-semibold text-muted-foreground">{title}</div>
            <div className={cn('num text-5xl leading-[58px] font-bold tracking-[-0.03em]', e.balance < 0 ? 'text-owe' : e.balance > 0 ? 'text-brand' : '')}>
              {money(e.balance)}
            </div>
            {e.received > 0 && (
              <>
                <Muted>
                  Te pasaron {money(e.received)} · se gastó {money(e.spent)}
                </Muted>
                <Bar className="mt-4" pct={pct} label={`${pct}% gastado`} />
              </>
            )}
          </Glass>
          <div className="flex flex-wrap gap-2.5">
            {!e.closed && (
              <Button onClick={() => openForm({ type: 'expense', eventName: e.name })}>
                <Plus /> Agregar gasto
              </Button>
            )}
            {single && e.balance < 0 && (
              <Link to={`/personas/${single.id}/saldar`} className={buttonVariants({ variant: 'glass' })}>
                Devolver lo que sobra
              </Link>
            )}
          </div>
          <Glass className="px-[22px] py-2 lg:px-6">
            <label className="flex min-h-14 cursor-pointer items-center gap-3 text-[15px] font-semibold">
              <Checkbox checked={e.includeMe} disabled={update.isPending} onCheckedChange={(v) => update.mutate({ includeMe: v === true })} />
              <span className="flex-1">Participo</span>
              <span className="text-xs font-medium text-muted-foreground">{e.includeMe ? 'Pagás tu parte' : 'Todo es de ellos'}</span>
            </label>
            {e.people.map((p) => (
              <BalanceLine
                key={p.id}
                p={p}
                action={
                  <button
                    type="button"
                    aria-label={`Sacar a ${p.name} del evento`}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ personIds: e.people.filter((x) => x.id !== p.id).map((x) => x.id) })}
                    className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
                  >
                    <X className="size-[18px]" strokeWidth={1.75} />
                  </button>
                }
              />
            ))}
            {!e.closed && <AddParticipant event={e} />}
            <ErrorText error={update.error} />
            <div className="h-2" />
          </Glass>
        </div>
        <Glass className="min-w-0 flex-[3_1_420px] px-[22px] py-1 lg:px-7">
          <MovementRows movements={e.movements} empty="Sin movimientos en este evento." amountOf={(m) => (e.includeMe && e.people.length ? m.myShare : null)} />
        </Glass>
      </div>
    </>
  )
}
