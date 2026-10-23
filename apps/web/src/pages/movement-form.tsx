import { ArrowRight, Minus, Plus, X } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Caption, Chip, ErrorText, Glass, Label, Loading, Muted } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  api,
  useApi,
  useSave,
  type Account,
  type Category,
  type EventItem,
  type Movement,
  type MovementType,
  type Person,
  type Relation,
} from '@/lib/api'
import { INCOME_RELATIONS, RELATION_LABEL, listNames, localDateTime, money, moneyInput, parseMoney, relationEffect } from '@/lib/format'
import { cn } from '@/lib/utils'

const NEW = '__new'
const NONE = 'none'

const TYPES: { type: MovementType; label: string; icon: typeof Plus; on: string; fg: string }[] = [
  { type: 'income', label: 'Ingreso', icon: Plus, on: 'bg-[#1E8A4C]/15 border-[#1E8A4C]/40', fg: 'text-income' },
  { type: 'expense', label: 'Egreso', icon: Minus, on: 'bg-[#C23B2E]/15 border-[#C23B2E]/40', fg: 'text-[#A82F24]' },
  { type: 'transfer', label: 'Transferencia entre cuentas', icon: ArrowRight, on: 'bg-[#2563C9]/15 border-[#2563C9]/40', fg: 'text-transfer' },
]

export interface FormOptions {
  initial?: Movement
  type?: MovementType
  personId?: number
  eventName?: string
}

// How an expense on an event gets split, as the form previews it.
function splitNote(eventName: string, events: EventItem[] | undefined, amount: number) {
  const ev = events?.find((e) => !e.closed && e.name.toLowerCase() === eventName.trim().toLowerCase())
  if (!ev) return `Se crea el evento «${eventName.trim()}». Sumale personas desde el evento para repartir.`
  if (!ev.people.length) return 'El evento todavía no tiene personas: el gasto queda todo tuyo.'
  const names = listNames(ev.people.map((p) => p.name))
  const share = money(Math.floor(amount / (ev.people.length + (ev.includeMe ? 1 : 0))))
  if (ev.includeMe) return `Se reparte entre vos y ${names}: ${share} cada uno.`
  return ev.people.length > 1 ? `Va a cuenta de ${names}: ${share} cada uno.` : `Va todo a cuenta de ${names}.`
}

function MovementFields({ initial, type: defaultType, personId, eventName: defaultEvent, onSaved }: FormOptions & { onSaved: () => void }) {
  const { data: accounts } = useApi<Account[]>('/accounts')
  const { data: people } = useApi<Person[]>('/people')
  const { data: categories } = useApi<Category[]>('/categories')
  const { data: events } = useApi<EventItem[]>('/events')

  const [amount, setAmount] = useState(initial ? moneyInput(String(initial.amount)) : '')
  const [type, setType] = useState<MovementType>(initial?.type ?? defaultType ?? 'expense')
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null)
  const [toAccountId, setToAccountId] = useState<number | null>(initial?.toAccountId ?? null)
  const [isOthers, setIsOthers] = useState(initial?.isOthers ?? !!personId)
  const [person, setPerson] = useState(String(initial?.personId ?? personId ?? NONE))
  const [newPerson, setNewPerson] = useState('')
  const [relation, setRelation] = useState<Relation | null>(initial?.relation ?? null)
  const [eventName, setEventName] = useState(initial?.event?.name ?? defaultEvent ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? localDateTime())

  const save = useSave((body: object) =>
    initial ? api.patch<Movement>(`/movements/${initial.id}`, body) : api.post<Movement>('/movements', body),
  )

  if (!accounts) return <Loading />

  const account = accountId ?? accounts[0]?.id
  const n = parseMoney(amount)
  const isTransfer = type === 'transfer'
  const isIncome = type === 'income'
  const others = !isTransfer && isOthers
  // Income: who handed it over and why. Expense: a loan or paying for someone ("Le devolví" comes from Saldar).
  const rel: Relation = isIncome
    ? relation && (INCOME_RELATIONS as readonly string[]).includes(relation)
      ? relation
      : INCOME_RELATIONS[0]
    : relation === 'returned'
      ? 'returned'
      : 'advanced'
  const personName = person === NEW ? newPerson.trim() || 'La persona' : people?.find((p) => String(p.id) === person)?.name
  const caption = isIncome ? (others ? 'Ingreso · plata de otra persona' : 'Ingreso · plata tuya') : type === 'expense' ? 'Egreso' : 'Transferencia entre tus cuentas'
  // Events take money someone handed you, or your own expenses to split.
  const showEvent = isIncome ? others : type === 'expense' && !others

  const submit = () =>
    save.mutate(
      {
        type,
        amount: n,
        description,
        date,
        accountId: account,
        toAccountId: isTransfer ? toAccountId : null,
        isOthers: others,
        categoryId: !isTransfer && !others ? categoryId : null,
        personId: others && person !== NONE && person !== NEW ? Number(person) : null,
        newPersonName: others && person === NEW ? newPerson : undefined,
        relation: others ? rel : null,
        eventName: showEvent ? eventName : '',
      },
      { onSuccess: onSaved },
    )

  const canSave = n > 0 && account && (!isTransfer || (toAccountId && toAccountId !== account)) && !(others && person === NEW && !newPerson.trim())

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) submit()
      }}
    >
      <Glass className="px-[22px] py-4">
        <label htmlFor="monto" className="block text-[13px] font-semibold text-muted-foreground">
          Monto
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-4xl font-semibold text-muted-foreground">$</span>
          <input
            id="monto"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(moneyInput(e.target.value))}
            className="num min-w-0 flex-1 bg-transparent p-0 text-[40px] font-bold tracking-[-0.02em] outline-none placeholder:text-foreground/25"
          />
        </div>
      </Glass>

      <div>
        <div className="flex gap-2.5">
          {TYPES.map((t) => {
            const on = type === t.type
            const gold = on && t.type === 'income' && others
            return (
              <button
                key={t.type}
                type="button"
                aria-label={t.label}
                aria-pressed={on}
                onClick={() => {
                  setType(t.type)
                  setRelation(null)
                }}
                className={cn(
                  'flex h-14 flex-1 cursor-pointer items-center justify-center rounded-full border backdrop-blur-lg',
                  gold ? 'border-[#F2C230]/40 bg-[#F2C230]/15 text-others' : on ? t.on : 'border-white/70 bg-white/22',
                  !gold && t.fg,
                )}
              >
                <t.icon className="size-[26px]" strokeWidth={1.75} />
              </button>
            )
          })}
        </div>
        <div className="mt-2 text-center text-[13px] font-semibold text-muted-foreground">{caption}</div>
      </div>

      <div>
        <Caption>{isTransfer ? 'Desde' : 'Cuenta'}</Caption>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <Chip key={a.id} active={a.id === account} onClick={() => setAccountId(a.id)}>
              {a.name}
            </Chip>
          ))}
        </div>
      </div>

      {isTransfer && (
        <>
          <div>
            <Caption>Hacia</Caption>
            <div className="flex flex-wrap gap-2">
              {accounts
                .filter((a) => a.id !== account)
                .map((a) => (
                  <Chip key={a.id} active={a.id === toAccountId} onClick={() => setToAccountId(a.id)}>
                    {a.name}
                  </Chip>
                ))}
            </div>
          </div>
          <Glass soft className="rounded-[20px] bg-white/50 px-[18px] py-3.5">
            <Muted>Mover plata entre tus cuentas no es gasto ni ingreso. Solo cambia dónde está.</Muted>
          </Glass>
        </>
      )}

      {!isTransfer && (
        <label className="glass flex min-h-14 cursor-pointer items-center gap-3 rounded-[28px] px-5 text-[15px] font-semibold shadow-none">
          <Checkbox checked={isOthers} onCheckedChange={(v) => setIsOthers(v === true)} />
          <span>{isIncome ? 'Es plata de otra persona' : 'Le presto o pago por otra persona'}</span>
        </label>
      )}

      {others && (
        <div className="flex flex-col gap-3.5">
          <div>
            <Label htmlFor="persona">Persona (opcional)</Label>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger id="persona">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin asignar</SelectItem>
                {people?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>+ Agregar persona…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {person === NEW && (
            <div>
              <Label htmlFor="nueva">Nombre de la persona nueva</Label>
              <Input id="nueva" placeholder="Ej: Fede" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
            </div>
          )}
          {person === NONE ? (
            <Muted className="px-1.5 text-[13px] leading-[18px]">
              {isIncome ? 'Queda como plata de otros, sin persona.' : 'Queda como plata que te deben, sin persona.'} Podés asignarla después.
            </Muted>
          ) : (
            <div className="flex flex-col gap-2.5">
              {isIncome && (
                <div className="flex flex-wrap gap-2">
                  {INCOME_RELATIONS.map((r) => (
                    <Chip key={r} active={r === rel} onClick={() => setRelation(r)}>
                      {RELATION_LABEL[r]}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="px-1.5 text-[13px] font-semibold text-brand-dark">{relationEffect(rel, personName ?? '', n)}</div>
            </div>
          )}
        </div>
      )}

      {!isTransfer && !others && !!categories?.length && (
        <div>
          <Caption>Categoría</Caption>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} active={c.id === categoryId} onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {showEvent && (
        <div>
          <Label htmlFor="evento">Evento (opcional)</Label>
          <Input id="evento" list="eventos" placeholder="Ej: Cena sábado" value={eventName} onChange={(e) => setEventName(e.target.value)} />
          <datalist id="eventos">
            {events?.filter((e) => !e.closed).map((e) => <option key={e.id} value={e.name} />)}
          </datalist>
          {type === 'expense' && eventName.trim() && (
            <Muted className="mt-2 px-1.5 text-[13px] leading-[18px] font-semibold text-brand-dark">{splitNote(eventName, events, n)}</Muted>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="descripcion">Descripción (opcional)</Label>
        <Input id="descripcion" placeholder="Ej: Supermercado" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="fecha">Fecha</Label>
        <Input id="fecha" type="datetime-local" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>

      <ErrorText error={save.error} />

      <div className="sticky bottom-0 -mx-1 bg-linear-to-b from-[#EEF3F0]/0 to-[#EEF3F0] to-40% px-1 pt-6 pb-1">
        <Button type="submit" size="lg" disabled={!canSave || save.isPending} className="w-full shadow-[0_10px_24px_rgba(16,32,27,0.25)]">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

const FormContext = createContext<(opts?: FormOptions) => void>(() => {})
export const useMovementForm = () => useContext(FormContext)

// The movement form floats over whatever page is open, so saving never navigates away.
// Desktop: fixed panel on the right. Mobile: sheet from the bottom.
export function MovementFormProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<FormOptions | null>(null)
  const [key, setKey] = useState(0)
  const open = (o: FormOptions = {}) => {
    setOpts(o)
    setKey((k) => k + 1)
  }
  const close = () => setOpts(null)

  useEffect(() => {
    if (!opts) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts])

  return (
    <FormContext.Provider value={open}>
      {children}
      {opts && (
        <>
          <div className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" onClick={close} />
          <section
            role="dialog"
            aria-label={opts.initial ? 'Editar movimiento' : 'Nuevo movimiento'}
            className="fixed inset-x-0 bottom-0 z-40 flex max-h-[92dvh] flex-col rounded-t-[32px] border border-white/85 bg-[#EEF3F0]/95 shadow-[0_-12px_40px_rgba(20,50,40,0.18)] backdrop-blur-2xl lg:inset-x-auto lg:top-6 lg:right-6 lg:bottom-6 lg:max-h-none lg:w-[420px] lg:rounded-[36px] lg:shadow-[0_22px_54px_rgba(15,60,50,0.22)]"
          >
            <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-2 lg:px-7 lg:pt-6">
              <h2 className="text-lg font-bold">{opts.initial ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
              <button type="button" aria-label="Cerrar" onClick={close} className="-mr-2.5 flex size-11 cursor-pointer items-center justify-center">
                <X className="size-6" strokeWidth={1.75} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 pb-[max(20px,env(safe-area-inset-bottom))] lg:px-7 lg:pb-6">
              <MovementFields key={key} {...opts} onSaved={close} />
            </div>
          </section>
        </>
      )}
    </FormContext.Provider>
  )
}
