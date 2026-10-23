import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Caption, Chip, ErrorText, Glass, Label, Loading, Muted, Tab } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { api, useApi, useSave, type Account, type Category, type EventItem, type FixedExpense, type Person } from '@/lib/api'
import { ACCOUNT_LABEL, money, moneyInput, parseMoney, signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/layout'
import { useLogout } from './login'

type Values = Record<string, string>
interface Field {
  id: string
  label: string | ((v: Values) => string)
  placeholder: string
  money?: boolean
  show?: (v: Values) => boolean
}
interface Section<T> {
  id: string
  label: string
  short?: string
  url: string
  note: string
  row: (item: T) => { name: string; sub: string; amount?: string }
  // Detail page for a row, when it has one.
  link?: (item: T) => string
  fields: Field[]
  chips?: { key: string; label: string; options: [string, string][] }
  values: (item?: T) => Values
  body: (v: Values) => object
}

const SECTIONS = [
  {
    id: 'cuentas',
    label: 'Cuentas',
    url: '/accounts',
    note: 'Las cuentas arman la composición de tu plata. La tarjeta cuenta como deuda, no como saldo.',
    row: (a: Account) => ({ name: a.name, sub: ACCOUNT_LABEL[a.type], amount: a.type === 'credit_card' ? money(a.balance) : signed(a.balance) }),
    fields: [
      { id: 'name', label: 'Nombre', placeholder: 'Ej: Caja de ahorro USD' },
      { id: 'initialBalance', label: (v: Values) => (v.type === 'credit_card' ? 'Deuda inicial' : 'Saldo inicial'), placeholder: '$ 0', money: true },
      { id: 'dueDay', label: 'Día de vencimiento', placeholder: '1 a 31', show: (v: Values) => v.type === 'credit_card' },
    ],
    chips: {
      key: 'type',
      label: 'Tipo',
      options: [
        ['cash', 'Efectivo'],
        ['bank', 'Banco'],
        ['wallet', 'Billetera'],
        ['credit_card', 'Tarjeta de crédito'],
      ],
    },
    values: (a?: Account) => ({
      name: a?.name ?? '',
      type: a?.type ?? 'cash',
      initialBalance: a ? moneyInput(String(Math.abs(a.initialBalance))) : '',
      dueDay: a?.dueDay ? String(a.dueDay) : '',
    }),
    body: (v: Values) => ({
      name: v.name,
      type: v.type,
      initialBalance: parseMoney(v.initialBalance),
      dueDay: v.type === 'credit_card' && v.dueDay ? Number(v.dueDay) : null,
    }),
  } satisfies Section<Account>,
  {
    id: 'fijos',
    label: 'Gastos fijos',
    url: '/fixed-expenses',
    note: 'Gastos que se repiten todos los meses. Aparecen solos como pendientes en Pagos.',
    row: (f: FixedExpense) => ({ name: f.name, sub: `Día ${f.dayOfMonth} · ${f.account.name}`, amount: money(f.amount) }),
    fields: [
      { id: 'name', label: 'Nombre', placeholder: 'Ej: Gimnasio' },
      { id: 'amount', label: 'Monto', placeholder: '$ 0', money: true },
      { id: 'dayOfMonth', label: 'Día del mes', placeholder: '1 a 31' },
    ],
    values: (f?: FixedExpense) => ({
      name: f?.name ?? '',
      amount: f ? moneyInput(String(f.amount)) : '',
      dayOfMonth: f ? String(f.dayOfMonth) : '',
      accountId: f ? String(f.accountId) : '',
    }),
    body: (v: Values) => ({ name: v.name, amount: parseMoney(v.amount), dayOfMonth: Number(v.dayOfMonth), accountId: Number(v.accountId) }),
  } satisfies Section<FixedExpense>,
  {
    id: 'personas',
    label: 'Personas y grupos',
    short: 'Personas',
    url: '/people',
    note: 'Personas y grupos con los que tenés plata en común. Cada uno tiene su cuenta corriente.',
    row: (p: Person) => ({ name: p.name, sub: p.kind === 'group' ? 'Grupo' : 'Persona' }),
    link: (p: Person) => `/personas/${p.id}`,
    fields: [{ id: 'name', label: 'Nombre', placeholder: 'Ej: Fede' }],
    chips: {
      key: 'kind',
      label: 'Tipo',
      options: [
        ['person', 'Persona'],
        ['group', 'Grupo'],
      ],
    },
    values: (p?: Person) => ({ name: p?.name ?? '', kind: p?.kind ?? 'person' }),
    body: (v: Values) => ({ name: v.name, kind: v.kind }),
  } satisfies Section<Person>,
  {
    id: 'eventos',
    label: 'Eventos',
    url: '/events',
    note: 'Salidas, viajes o compras en conjunto. Los gastos se reparten en partes iguales entre sus personas, y con vos si participás.',
    row: (e: EventItem) => ({
      name: e.name,
      sub: `${e.people.length ? e.people.map((p) => p.name).join(', ') : 'Sin personas'} · ${e.closed ? 'cerrado' : 'abierto'}`,
    }),
    link: (e: EventItem) => `/eventos/${e.id}`,
    fields: [{ id: 'name', label: 'Nombre', placeholder: 'Ej: Cumple de Sofi' }],
    // personIds travels as "1,4,7" so it fits the string form state.
    values: (e?: EventItem) => ({ name: e?.name ?? '', personIds: e?.people.map((p) => p.id).join(',') ?? '', includeMe: String(e?.includeMe ?? true) }),
    body: (v: Values) => ({ name: v.name, personIds: v.personIds ? v.personIds.split(',').map(Number) : [], includeMe: v.includeMe === 'true' }),
  } satisfies Section<EventItem>,
  {
    id: 'cats',
    label: 'Categorías',
    url: '/categories',
    note: 'Categorías con un tope mensual. Te avisamos cuando te acercás al límite.',
    row: (c: Category) => ({ name: c.name, sub: 'Tope mensual', amount: money(c.monthlyLimit) }),
    fields: [
      { id: 'name', label: 'Nombre', placeholder: 'Ej: Salud' },
      { id: 'monthlyLimit', label: 'Tope mensual', placeholder: '$ 0', money: true },
    ],
    values: (c?: Category) => ({ name: c?.name ?? '', monthlyLimit: c ? moneyInput(String(c.monthlyLimit)) : '' }),
    body: (v: Values) => ({ name: v.name, monthlyLimit: parseMoney(v.monthlyLimit) }),
  } satisfies Section<Category>,
]

type AnySection = Section<{ id: number }>

function Editor({ section, item, onDone }: { section: AnySection; item?: { id: number }; onDone: () => void }) {
  const [v, setV] = useState<Values>(() => section.values(item))
  const set = (k: string, val: string) => setV((prev) => ({ ...prev, [k]: val }))
  const { data: accounts } = useApi<Account[]>(section.id === 'fijos' ? '/accounts' : null)
  const { data: people } = useApi<Person[]>(section.id === 'eventos' ? '/people' : null)
  // Fixed expenses default to the first account until one is picked.
  const accountId = v.accountId || String(accounts?.[0]?.id ?? '')
  const body = () => section.body(accounts ? { ...v, accountId } : v)
  const save = useSave(() => (item ? api.patch(`${section.url}/${item.id}`, body()) : api.post(section.url, body())))
  const remove = useSave(() => api.del(`${section.url}/${item!.id}`))

  return (
    <Glass className="flex flex-col gap-3.5 p-[22px] lg:rounded-[32px] lg:p-7">
      {section.fields
        .filter((f) => !f.show || f.show(v))
        .map((f) => (
          <div key={f.id}>
            <Label htmlFor={`${section.id}-${f.id}`}>{typeof f.label === 'function' ? f.label(v) : f.label}</Label>
            <Input
              id={`${section.id}-${f.id}`}
              inputMode={f.id === 'name' ? undefined : 'numeric'}
              placeholder={f.placeholder}
              value={f.money && v[f.id] ? `$ ${v[f.id]}` : v[f.id]}
              onChange={(e) => set(f.id, f.money ? moneyInput(e.target.value) : f.id === 'name' ? e.target.value : e.target.value.replace(/\D/g, ''))}
            />
          </div>
        ))}
      {section.chips && (
        <div>
          <Caption>{section.chips.label}</Caption>
          <div className="flex flex-wrap gap-2">
            {section.chips.options.map(([val, label]) => (
              <Chip key={val} active={v[section.chips!.key] === val} onClick={() => set(section.chips!.key, val)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {accounts && (
        <div>
          <Caption>Se paga con</Caption>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <Chip key={a.id} active={String(a.id) === accountId} onClick={() => set('accountId', String(a.id))}>
                {a.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {people && (
        <>
          <div>
            <Caption>Personas</Caption>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => {
                const ids = v.personIds ? v.personIds.split(',') : []
                const on = ids.includes(String(p.id))
                return (
                  <Chip key={p.id} active={on} onClick={() => set('personIds', (on ? ids.filter((x) => x !== String(p.id)) : [...ids, String(p.id)]).join(','))}>
                    {p.name}
                  </Chip>
                )
              })}
              {people.length === 0 && <Muted>Todavía no cargaste personas.</Muted>}
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold">
            <Checkbox checked={v.includeMe === 'true'} onCheckedChange={(c) => set('includeMe', String(c === true))} />
            Participo (los gastos se reparten también con vos)
          </label>
        </>
      )}
      <ErrorText error={save.error ?? remove.error} />
      <div className="flex flex-wrap gap-2.5">
        <Button
          disabled={!v.name.trim() || save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onDone })}
        >
          Guardar
        </Button>
        {item && (
          <Button variant="glass" className="text-danger" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: onDone })}>
            Eliminar
          </Button>
        )}
      </div>
    </Glass>
  )
}

export default function Settings() {
  const logout = useLogout()
  const [params] = useSearchParams()
  const [sectionId, setSectionId] = useState(() => (SECTIONS.some((s) => s.id === params.get('seccion')) ? params.get('seccion')! : 'cuentas'))
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const section = SECTIONS.find((s) => s.id === sectionId) as unknown as AnySection
  const { data: items } = useApi<{ id: number }[]>(section.url)
  const editItem = typeof editing === 'number' ? items?.find((i) => i.id === editing) : undefined

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2">
        <Link to="/" aria-label="Volver al inicio" className="-ml-2.5 flex size-11 items-center justify-center lg:hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="flex-1 text-xl font-bold lg:text-[32px] lg:tracking-[-0.02em]">Configuración</h1>
        <Button variant="ghost" size="sm" onClick={logout}>
          Cerrar sesión
        </Button>
      </div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {SECTIONS.map((s) => (
          <Tab
            key={s.id}
            active={s.id === sectionId}
            onClick={() => {
              setSectionId(s.id)
              setEditing(null)
            }}
          >
            {s.short ? (
              <>
                <span className="lg:hidden">{s.short}</span>
                <span className="hidden lg:inline">{s.label}</span>
              </>
            ) : (
              s.label
            )}
          </Tab>
        ))}
      </div>
      <Muted className="px-1">{section.note}</Muted>
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
          <Glass className="py-1 pr-2 pl-[22px]">
            {!items && <Loading />}
            {items?.length === 0 && <div className="flex min-h-16 items-center text-sm text-muted-foreground">Todavía no hay nada acá.</div>}
            {items?.map((it) => {
              const r = section.row(it)
              return (
                <div key={it.id} className={cn('flex min-h-16 items-center gap-1 border-line lg:min-h-[68px] [&+&]:border-t', editing === it.id && 'font-bold')}>
                  {section.link ? (
                    <Link to={section.link(it)} className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.sub}</div>
                    </div>
                  )}
                  {r.amount && <div className="num text-[15px] font-bold">{r.amount}</div>}
                  <button
                    type="button"
                    aria-label={`Editar ${r.name}`}
                    onClick={() => setEditing(editing === it.id ? null : it.id)}
                    className="flex size-11 cursor-pointer items-center justify-center text-muted-foreground"
                  >
                    <Pencil className="size-[18px]" strokeWidth={1.75} />
                  </button>
                </div>
              )
            })}
          </Glass>
          <Button variant="glass" className="self-start" aria-expanded={editing === 'new'} onClick={() => setEditing(editing === 'new' ? null : 'new')}>
            {editing === 'new' ? 'Cancelar' : <><Icon name="plus" size={18} /> Agregar</>}
          </Button>
        </div>
        {editing !== null && (
          <div className="min-w-0 flex-[2_1_340px]">
            <Editor key={`${sectionId}-${editing}`} section={section} item={editItem} onDone={() => setEditing(null)} />
          </div>
        )}
      </div>
    </>
  )
}
