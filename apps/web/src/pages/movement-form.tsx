import { ArrowRight, Minus, Plus, X } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Caption, Chip, Collapse, ErrorText, Glass, Label, Loading, Muted } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ShortNote } from '@/components/short-note'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  api,
  useApi,
  useSave,
  type Account,
  type Category,
  type EventDetail,
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

const TYPES: { type: MovementType; short: string; label: string; icon: typeof Plus; on: string; fg: string }[] = [
  { type: 'income', short: 'Ingreso', label: 'Ingreso', icon: Plus, on: 'bg-[#1E8A4C]/15 border-[#1E8A4C]/40', fg: 'text-income' },
  { type: 'expense', short: 'Egreso', label: 'Egreso', icon: Minus, on: 'bg-[#C23B2E]/15 border-[#C23B2E]/40', fg: 'text-[#A82F24]' },
  { type: 'transfer', short: 'Transferir', label: 'Transferencia entre cuentas', icon: ArrowRight, on: 'bg-[#2563C9]/15 border-[#2563C9]/40', fg: 'text-transfer' },
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
  const [date, setDate] = useState((initial?.date ?? localDateTime()).slice(0, 10))

  const [creatingEvent, setCreatingEvent] = useState(false)
  const openEvents = events?.filter((e) => !e.closed) ?? []
  const evId = openEvents.find((e) => e.name.toLowerCase() === eventName.trim().toLowerCase())?.id
  // Money coming back from someone for their part of an event: event first, then only who still owes.
  const returning = type === 'income' && isOthers && relation === 'returned_to_me'
  const { data: evDetail } = useApi<EventDetail>(returning && evId ? `/events/${evId}` : null)

  const save = useSave((body: object) =>
    initial ? api.patch<Movement>(`/movements/${initial.id}`, body) : api.post<Movement>('/movements', body),
  )

  const ready = !!accounts
  useEffect(() => {
    if (ready) document.getElementById('monto')?.focus({ preventScroll: true })
  }, [ready])

  if (!accounts) return <Loading />

  // Billetera, efectivo, banco (the card last): the first one is the default.
  const ORDER = ['wallet', 'cash', 'bank', 'credit_card']
  const ordered = [...accounts].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
  const account = accountId ?? ordered[0]?.id
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
  // Events take money someone handed you, or your own expenses to split.
  const showEvent = isIncome ? others : type === 'expense' && !others
  const eventSel = evId ? String(evId) : creatingEvent || eventName ? NEW : NONE
  const personOptions =
    returning && evId
      ? (evDetail?.people.filter((p) => p.balance > 0 || p.id === initial?.personId) ?? [])
      : (people ?? [])
  const pickRelation = (r: Relation) => {
    if ((r === 'returned_to_me') !== returning) setPerson(NONE)
    setRelation(r)
  }
  const pickEvent = (v: string) => {
    setPerson(NONE)
    setCreatingEvent(v === NEW)
    const ev = openEvents.find((e) => String(e.id) === v)
    setEventName(ev?.name ?? '')
    // Money coming in for an event where someone still owes is them paying their part back.
    if (ev && ev.balance > 0) setRelation('returned_to_me')
  }
  const pickPerson = (v: string) => {
    setPerson(v)
    const owed = returning ? evDetail?.people.find((p) => String(p.id) === v)?.balance : 0
    if (owed) setAmount(moneyInput(String(owed)))
  }

  const submit = () =>
    save.mutate(
      {
        type,
        amount: n,
        description,
        // Only the day is asked for; the clock time is kept just to order movements within a day.
        date: `${date}T${(initial?.date ?? localDateTime()).slice(11, 16)}`,
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

  const canSave = n > 0 && account && (!isTransfer || (toAccountId && toAccountId !== account)) && !(others && person === NEW && !newPerson.trim()) && !(returning && (!evId || person === NONE))

  return (
    <form
      className="flex flex-col gap-3 [&_[data-slot=input]]:h-11 [&_[data-slot=select-trigger][data-size]]:h-11 [&_button[aria-pressed]:not([aria-label])]:h-9 [&_button[aria-pressed]:not([aria-label])]:px-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) submit()
      }}
    >
      <Glass className="px-5 py-2.5">
        <label htmlFor="monto" className="sr-only">
          Monto
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-3xl font-semibold text-muted-foreground">$</span>
          <input
            id="monto"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(moneyInput(e.target.value))}
            // n closes; i / e / t pick the type without leaving the amount.
            onKeyDown={(e) => {
              if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault()
                return onSaved() // closes the form (same "n" that opens it)
              }
              const t = TYPES.find((x) => x.label[0].toLowerCase() === e.key.toLowerCase())
              if (!t || e.metaKey || e.ctrlKey || e.altKey) return
              e.preventDefault()
              setType(t.type)
              setRelation(null)
            }}
            className="num min-w-0 flex-1 bg-transparent p-0 text-4xl font-bold tracking-[-0.02em] outline-none placeholder:text-foreground/25"
          />
        </div>
      </Glass>

      <div className="flex gap-2">
          {TYPES.map((t) => {
            const on = type === t.type
            const gold = on && t.type === 'income' && others
            return (
              <button
                key={t.type}
                type="button"
                aria-label={t.label}
                aria-pressed={on}
                tabIndex={-1}
                onClick={() => {
                  setType(t.type)
                  setRelation(null)
                }}
                className={cn(
                  'flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border text-[13px] font-bold backdrop-blur-lg',
                  gold ? 'border-[#F2C230]/40 bg-[#F2C230]/15 text-others' : on ? t.on : 'border-white/70 bg-white/22',
                  !gold && t.fg,
                )}
              >
                <t.icon className="size-[18px]" strokeWidth={2} />
                {t.short}
              </button>
            )
          })}
      </div>

      <div>
        <Caption>{isTransfer ? 'Desde' : 'Cuenta'}</Caption>
        <div className="flex flex-wrap gap-2">
          {ordered.map((a) => (
            <Chip key={a.id} active={a.id === account} onClick={() => setAccountId(a.id)}>
              {a.name}
            </Chip>
          ))}
        </div>
      </div>

      <Collapse open={isTransfer}>
        <div className="flex flex-col gap-3">
          <div>
            <Caption>Hacia</Caption>
            <div className="flex flex-wrap gap-2">
              {ordered
                .filter((a) => a.id !== account)
                .map((a) => (
                  <Chip key={a.id} active={a.id === toAccountId} onClick={() => setToAccountId(a.id)}>
                    {a.name}
                  </Chip>
                ))}
            </div>
          </div>
          <Muted className="px-1.5 text-[13px] leading-[18px]">Solo cambia dónde está la plata: no es gasto ni ingreso.</Muted>
        </div>
      </Collapse>

      <Collapse open={!isTransfer}>
        <label className="glass flex min-h-11 cursor-pointer items-center gap-3 rounded-full px-4 text-sm font-semibold shadow-none">
          <Checkbox checked={isOthers} onCheckedChange={(v) => setIsOthers(v === true)} />
          <span>{isIncome ? 'Es plata de otra persona' : 'Le presto o pago por otra persona'}</span>
        </label>
      </Collapse>

      <Collapse open={others}>
        <div className="flex flex-col gap-3">
          {isIncome && (
            <div className="flex flex-wrap gap-2">
              {INCOME_RELATIONS.map((r) => (
                <Chip key={r} active={r === rel} onClick={() => pickRelation(r)}>
                  {RELATION_LABEL[r]}
                </Chip>
              ))}
            </div>
          )}
          {isIncome && (
            <div>
              <Label htmlFor="evento-sel">Evento{returning ? '' : ' (opcional)'}</Label>
              <Select value={eventSel} onValueChange={pickEvent}>
                <SelectTrigger id="evento-sel">
                  <SelectValue placeholder="Elegí un evento" />
                </SelectTrigger>
                <SelectContent>
                  {!returning && <SelectItem value={NONE}>Sin evento</SelectItem>}
                  {openEvents.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                    </SelectItem>
                  ))}
                  {!returning && <SelectItem value={NEW}>+ Evento nuevo…</SelectItem>}
                </SelectContent>
              </Select>
              <Collapse open={eventSel === NEW}>
                <Input aria-label="Nombre del evento nuevo" className="mt-2" placeholder="Ej: Cena sábado" value={eventName} onChange={(e) => setEventName(e.target.value)} />
              </Collapse>
            </div>
          )}
          <Collapse open={!returning || !!evId}>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="persona">{returning ? 'Quién devuelve' : 'Persona (opcional)'}</Label>
                <Select value={person} onValueChange={pickPerson}>
                  <SelectTrigger id="persona">
                    <SelectValue placeholder="Elegí una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {!returning && <SelectItem value={NONE}>Sin asignar</SelectItem>}
                    {personOptions.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                    {!returning && <SelectItem value={NEW}>+ Agregar persona…</SelectItem>}
                  </SelectContent>
                </Select>
                {returning && evDetail && !personOptions.length && <Muted className="mt-2 px-1.5 text-[13px]">Todos ya devolvieron su parte de este evento.</Muted>}
              </div>
              <Collapse open={person === NEW}>
                <div>
                  <Label htmlFor="nueva">Nombre de la persona nueva</Label>
                  <Input id="nueva" placeholder="Ej: Fede" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
                </div>
              </Collapse>
              {person === NONE ? (
                !returning && (
                  <Muted className="px-1.5 text-[13px] leading-[18px]">
                    Sin persona: la asignás después.
                  </Muted>
                )
              ) : (
                <div className="px-1.5 text-[13px] font-semibold text-brand-dark">{relationEffect(rel, personName ?? '', n)}</div>
              )}
            </div>
          </Collapse>
        </div>
      </Collapse>

      <Collapse open={!isTransfer && !others && !!categories?.length}>
        <div>
          <Caption>Categoría</Caption>
          <div className="flex flex-wrap gap-2">
            {categories?.map((c) => (
              <Chip key={c.id} active={c.id === categoryId} onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      </Collapse>

      <Collapse open={showEvent && !others}>
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
      </Collapse>

      <div>
        <Label htmlFor="descripcion">Descripción (opcional)</Label>
        <Input id="descripcion" placeholder="Ej: Supermercado" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="fecha">Fecha</Label>
        <DateField id="fecha" value={date} onChange={setDate} />
      </div>

      {(type === 'expense' || isTransfer) && (
        <ShortNote accountId={account} amount={n} credit={initial?.type === 'expense' && initial.accountId === account ? initial.amount : 0} />
      )}

      <ErrorText error={save.error} />

      <div className="sticky bottom-0 -mx-1 bg-linear-to-b from-[#EEF3F0]/0 to-[#EEF3F0] to-40% px-1 pt-4 pb-0.5">
        <Button type="submit" disabled={!canSave || save.isPending} className="w-full shadow-[0_10px_24px_rgba(16,32,27,0.25)]">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

type FormApi = ((opts?: FormOptions) => void) & { close: () => void; isOpen: boolean }
const FormContext = createContext<FormApi>(Object.assign(() => {}, { close: () => {}, isOpen: false }))
export const useMovementForm = () => useContext(FormContext)

// The movement form floats over whatever page is open, so saving never navigates away.
// Desktop: fixed panel on the right. Mobile: sheet from the bottom.
export function MovementFormProvider({ children }: { children: ReactNode }) {
  // Same reveal as Collapse: mount closed, flip to open next frame; unmount when the close transition ends.
  // opts stays set while it closes.
  const [opts, setOpts] = useState<FormOptions>({})
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  const [key, setKey] = useState(0)
  const open = (o: FormOptions = {}) => {
    setOpts(o)
    setKey((k) => k + 1)
    setMounted(true)
    setVisible(true)
  }
  const close = () => setVisible(false)

  useEffect(() => {
    if (!visible) return setShown(false)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(id)
  }, [visible])

  // The panel is inert until it has opened, so focus the amount only then.
  useEffect(() => {
    if (shown) document.getElementById('monto')?.focus({ preventScroll: true })
  }, [shown, key])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[data-radix-popper-content-wrapper]') && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  return (
    <FormContext.Provider value={Object.assign(open, { close, isOpen: visible })}>
      {children}
      {mounted && (
        <>
          <div
            className={cn('fixed inset-0 z-30 bg-foreground/20 transition-opacity duration-300 ease-apple lg:bg-transparent', shown ? 'opacity-100' : 'opacity-0')}
            onClick={close}
          />
          <section
            role="dialog"
            aria-label={opts.initial ? 'Editar movimiento' : 'Nuevo movimiento'}
            onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === 'opacity' && !visible && setMounted(false)}
            className={cn(
              'fixed inset-x-0 bottom-0 z-40 grid rounded-t-[32px] border border-white/85 bg-[#EEF3F0]/95 shadow-[0_-12px_40px_rgba(20,50,40,0.18)] backdrop-blur-2xl origin-bottom lg:inset-x-auto lg:top-6 lg:right-6 lg:bottom-auto lg:w-[420px] lg:rounded-[36px] lg:origin-top lg:shadow-[0_22px_54px_rgba(15,60,50,0.22)]',
              shown ? 'grid-rows-[1fr] opacity-100 [--fold:0deg]' : 'grid-rows-[0fr] opacity-0 [--fold:60deg] lg:[--fold:-60deg]',
            )}
            style={{
              transform: 'perspective(1100px) rotateX(var(--fold))',
              scale: shown ? 1 : 0.96,
              // Folds like a flap: height and tilt ease in, the fade overlaps the last stretch so no 2px border line is left at zero height.
              transition: shown
                ? 'grid-template-rows 300ms var(--ease-apple), transform 300ms var(--ease-apple), scale 300ms var(--ease-apple), opacity 200ms var(--ease-apple)'
                : 'grid-template-rows 210ms cubic-bezier(0.4, 0, 0.6, 1), transform 210ms cubic-bezier(0.4, 0, 0.6, 1), scale 210ms cubic-bezier(0.4, 0, 0.6, 1), opacity 120ms ease-in 90ms',
            }}
          >
            <div inert={!shown} className="flex max-h-[92dvh] min-h-0 flex-col overflow-hidden lg:max-h-[calc(100dvh-3rem)]">
              <div className="flex shrink-0 items-center justify-between px-6 pt-4 pb-1 lg:px-7 lg:pt-5">
                <h2 className="text-base font-bold">{opts.initial ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
                <button type="button" aria-label="Cerrar" onClick={close} className="-mr-2.5 flex size-11 cursor-pointer items-center justify-center">
                  <X className="size-6" strokeWidth={1.75} />
                </button>
              </div>
              <div className={cn('min-h-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))] lg:px-7 lg:pb-5', shown ? 'overflow-y-auto' : 'overflow-y-hidden')}>
                <MovementFields key={key} {...opts} onSaved={close} />
              </div>
            </div>
          </section>
        </>
      )}
    </FormContext.Provider>
  )
}
