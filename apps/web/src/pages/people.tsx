import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackTitle, Bar, Caption, Chip, ErrorText, Glass, Loading, Muted, PageTitle, Tab } from '@/components/kit'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, useApi, useSave, type Account, type EventDetail, type PersonDetail, type PersonRow } from '@/lib/api'
import { RELATION_LABEL, amountColor, balanceDir, dayMonth, daysAgo, initials, localDateTime, money, signed, signedMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MovementRows } from './movements'

function NewPerson({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'person' | 'group'>('person')
  const save = useSave(() => api.post('/people', { name, kind }))
  return (
    <Glass className="flex flex-col gap-3.5 p-[22px]">
      <div>
        <label htmlFor="p-nombre" className="mb-2 block text-[13px] font-semibold text-muted-foreground">
          Nombre
        </label>
        <Input id="p-nombre" autoFocus placeholder="Ej: Fede" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Chip active={kind === 'person'} onClick={() => setKind('person')}>
          Persona
        </Chip>
        <Chip active={kind === 'group'} onClick={() => setKind('group')}>
          Grupo
        </Chip>
      </div>
      <ErrorText error={save.error} />
      <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onDone })}>
        Guardar
      </Button>
    </Glass>
  )
}

function PeopleList({ selected }: { selected?: number }) {
  const { data: s } = useApi<{ owe: number; owed: number }>('/summary')
  const { data: people } = useApi<PersonRow[]>('/people')
  const [adding, setAdding] = useState(false)
  if (!people) return <Loading />

  const open = people.filter((p) => p.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  const even = people.filter((p) => p.balance === 0).map((p) => p.name)

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        action={
          <button
            type="button"
            aria-label="Agregar persona o grupo"
            aria-expanded={adding}
            onClick={() => setAdding(!adding)}
            className="glass flex size-11 cursor-pointer items-center justify-center rounded-full shadow-none"
          >
            <Plus className="size-[22px]" strokeWidth={1.75} />
          </button>
        }
      >
        Personas
      </PageTitle>
      {adding && <NewPerson onDone={() => setAdding(false)} />}
      {s && (
        <div className="px-1 text-sm text-muted-foreground">
          Debés <b className="num text-owe">{money(s.owe)}</b> · Te deben <b className="num text-brand">{money(s.owed)}</b>
        </div>
      )}
      {open.length > 0 && (
        <Glass className="overflow-hidden px-[22px] py-1 lg:px-6">
          {open.map((p) => {
            const ago = p.lastMovementDate ? daysAgo(p.lastMovementDate) : 0
            const sub = [p.eventName, ago >= 7 && `hace ${ago} días`].filter(Boolean).join(' · ')
            return (
              <Link
                key={p.id}
                to={`/personas/${p.id}`}
                className={cn(
                  'flex min-h-[72px] items-center gap-3.5 border-line lg:min-h-[76px] [&+&]:border-t',
                  selected === p.id && 'lg:-mx-6 lg:bg-brand/7 lg:px-6',
                )}
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/12 text-sm font-bold text-brand-dark">
                  {initials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{sub}</div>
                </div>
                <div className="text-right">
                  <div className={cn('num text-[15px] font-bold', p.balance < 0 ? 'text-owe' : 'text-brand')}>{money(p.balance)}</div>
                  <div className="text-xs text-muted-foreground">{balanceDir(p.balance, p)}</div>
                </div>
              </Link>
            )
          })}
        </Glass>
      )}
      {even.length > 0 && (
        <div className="text-center text-[13px] text-muted-foreground">
          {even.length === 1 ? `${even[0]} está a mano` : `${even.slice(0, -1).join(', ')} y ${even.at(-1)} están a mano`}
        </div>
      )}
      {people.length === 0 && !adding && <Muted className="text-center">Todavía no tenés plata en común con nadie.</Muted>}
    </div>
  )
}

// Shared by people and events: balance card with "te pasó X, gastaste Y".
export function BalanceCard({ balance, received, spent, group, context }: { balance: number; received: number; spent: number; group: boolean; context?: string }) {
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
            {[context, `te ${group ? 'pasaron' : 'pasó'} ${money(received)}, gastaste ${money(spent)}`].filter(Boolean).join(' · ')}
          </Muted>
          <Bar className="mt-4" pct={pct} label={`${pct}% rendido`} />
        </>
      )}
    </Glass>
  )
}

function PersonPanel({ id }: { id: number }) {
  const { data: p } = useApi<PersonDetail>(`/people/${id}`)
  if (!p) return <Loading />
  const group = p.kind === 'group'
  const openEvent = p.events.find((e) => !e.closed)
  return (
    <div className="flex flex-col gap-4">
      <BackTitle to="/personas" label="Personas">
        {p.name}
      </BackTitle>
      <div className="hidden text-[28px] font-bold tracking-[-0.02em] lg:block">{p.name}</div>
      <BalanceCard balance={p.balance} received={p.received} spent={p.spent} group={group} context={openEvent?.name} />
      <div className="flex gap-2.5">
        <Link to={`/personas/${p.id}/saldar`} className={cn(buttonVariants(), 'flex-1')}>
          {p.balance > 0 ? (group ? 'Me devolvieron' : 'Me devolvió') : group ? 'Les devolví' : 'Le devolví'}
        </Link>
        <Link to={`/movimientos/nuevo?personId=${p.id}&back=/personas/${p.id}`} className={cn(buttonVariants({ variant: 'glass' }), 'flex-1')}>
          Nuevo movimiento
        </Link>
      </div>
      {p.events.length > 0 && (
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
      )}
      <Glass className="px-[22px] py-1">
        {p.movements.length === 0 && <div className="flex min-h-15 items-center text-sm text-muted-foreground">Sin movimientos.</div>}
        {p.movements.map((m) => (
          <Link key={m.id} to={`/movimientos/${m.id}`} className="flex min-h-15 items-center justify-between gap-3 border-line [&+&]:border-t">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{m.relation ? RELATION_LABEL[m.relation] : m.description}</div>
              <div className="text-xs text-muted-foreground">
                {[dayMonth(m.date), m.relation && m.description].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className={cn('num text-[15px] font-bold', amountColor(m))}>{signedMoney(m)}</div>
          </Link>
        ))}
      </Glass>
    </div>
  )
}

export default function People() {
  const { id } = useParams()
  const { data: people } = useApi<PersonRow[]>('/people')
  // Desktop shows the first person with an open balance when none is picked.
  const fallback = people?.filter((p) => p.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))[0]?.id
  const selected = id ? Number(id) : undefined
  const panel = selected ?? fallback

  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className={cn('min-w-0 flex-[3_1_420px]', selected && 'hidden lg:block')}>
        <PeopleList selected={panel} />
      </div>
      {panel && (
        <div className={cn('min-w-0 flex-[2_1_340px]', !selected && 'hidden lg:block')}>
          <PersonPanel id={panel} />
        </div>
      )}
    </div>
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

export function EventPage() {
  const { id } = useParams()
  const { data: e } = useApi<EventDetail>(`/events/${id}`)
  const toggle = useSave((closed: boolean) => api.patch(`/events/${id}`, { closed }))
  if (!e) return <Loading />
  const group = e.person?.kind === 'group'
  const back = e.personId ? `/personas/${e.personId}` : '/personas'
  const pct = e.received ? Math.round((e.spent / e.received) * 100) : 0
  const title = e.balance < 0 ? (group ? 'Les debés' : 'Le debés') : e.balance > 0 ? (group ? 'Te deben' : 'Te debe') : 'Quedó en cero'

  return (
    <>
      <BackTitle to={back} label={e.person?.name ?? 'Personas'}>
        {e.name}
      </BackTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="hidden text-[28px] font-bold tracking-[-0.02em] lg:block">{e.name}</h1>
          <Muted>
            {e.person?.name ?? 'Sin persona'} · {e.closed ? 'cerrado' : 'abierto'}
          </Muted>
        </div>
        <Button variant="glass" disabled={toggle.isPending} onClick={() => toggle.mutate(!e.closed)}>
          {e.closed ? 'Reabrir evento' : 'Cerrar evento'}
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-3.5">
          <Glass className="px-[26px] py-6 lg:rounded-[36px] lg:px-8 lg:py-7">
            <div className="text-sm font-semibold text-muted-foreground">{title}</div>
            <div className={cn('num text-5xl leading-[58px] font-bold tracking-[-0.03em]', e.balance < 0 && 'text-owe')}>{money(e.balance)}</div>
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
            {e.personId && e.balance < 0 && (
              <Link to={`/personas/${e.personId}/saldar`} className={buttonVariants()}>
                Devolver lo que sobra
              </Link>
            )}
            {!e.closed && (
              <Link
                to={`/movimientos/nuevo?type=expense&relation=spent_theirs&event=${encodeURIComponent(e.name)}${e.personId ? `&personId=${e.personId}` : ''}&back=/eventos/${e.id}`}
                className={buttonVariants({ variant: 'glass' })}
              >
                Agregar gasto
              </Link>
            )}
          </div>
        </div>
        <Glass className="min-w-0 flex-[3_1_420px] px-[22px] py-1 lg:px-7">
          <MovementRows movements={e.movements} empty="Sin movimientos en este evento." />
        </Glass>
      </div>
    </>
  )
}
