import { ArrowRight, Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
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
import {
  EXPENSE_RELATIONS,
  INCOME_RELATIONS,
  RELATION_LABEL,
  localDateTime,
  moneyInput,
  parseMoney,
  relationEffect,
} from '@/lib/format'
import { cn } from '@/lib/utils'

const NEW = '__new'
const NONE = 'none'

const TYPES: { type: MovementType; label: string; icon: typeof Plus; on: string; fg: string }[] = [
  { type: 'income', label: 'Ingreso', icon: Plus, on: 'bg-[#1E8A4C]/15 border-[#1E8A4C]/40', fg: 'text-income' },
  { type: 'expense', label: 'Egreso', icon: Minus, on: 'bg-[#C23B2E]/15 border-[#C23B2E]/40', fg: 'text-[#A82F24]' },
  { type: 'transfer', label: 'Transferencia entre cuentas', icon: ArrowRight, on: 'bg-[#2563C9]/15 border-[#2563C9]/40', fg: 'text-transfer' },
]

export interface FormDefaults {
  type?: MovementType
  personId?: number
  eventName?: string
  relation?: Relation
}

function MovementFields({ initial, defaults, onSaved }: { initial?: Movement; defaults?: FormDefaults; onSaved: (m: Movement) => void }) {
  const { data: accounts } = useApi<Account[]>('/accounts')
  const { data: people } = useApi<Person[]>('/people')
  const { data: categories } = useApi<Category[]>('/categories')
  const { data: events } = useApi<EventItem[]>('/events')

  const [amount, setAmount] = useState(initial ? moneyInput(String(initial.amount)) : '')
  const [type, setType] = useState<MovementType>(initial?.type ?? defaults?.type ?? 'expense')
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null)
  const [toAccountId, setToAccountId] = useState<number | null>(initial?.toAccountId ?? null)
  const [isOthers, setIsOthers] = useState(initial?.isOthers ?? !!(defaults?.personId || defaults?.eventName))
  const [person, setPerson] = useState(String(initial?.personId ?? defaults?.personId ?? NONE))
  const [newPerson, setNewPerson] = useState('')
  const [relation, setRelation] = useState<Relation | null>(initial?.relation ?? defaults?.relation ?? null)
  const [eventName, setEventName] = useState(initial?.event?.name ?? defaults?.eventName ?? '')
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
  const others = !isTransfer && isOthers
  const relations = type === 'income' ? INCOME_RELATIONS : EXPENSE_RELATIONS
  const rel = relation && (relations as readonly string[]).includes(relation) ? relation : relations[0]
  const personName = person === NEW ? newPerson.trim() || 'La persona' : people?.find((p) => String(p.id) === person)?.name
  const caption =
    type === 'income' ? (others ? 'Ingreso · plata de otra persona' : 'Ingreso · plata tuya') : type === 'expense' ? 'Egreso' : 'Transferencia entre tus cuentas'

  const pickType = (t: MovementType) => {
    setType(t)
    setRelation(null)
  }

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
        relation: others && person !== NONE ? rel : null,
        eventName: others ? eventName : undefined,
      },
      { onSuccess: (m) => onSaved(m as Movement) },
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
          <span className="text-4xl font-semibold text-muted-foreground lg:text-3xl">$</span>
          <input
            id="monto"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(moneyInput(e.target.value))}
            className="num min-w-0 flex-1 bg-transparent p-0 text-[40px] font-bold tracking-[-0.02em] outline-none placeholder:text-foreground/25 lg:text-4xl"
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
                onClick={() => pickType(t.type)}
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
          <span>{type === 'income' ? 'Es plata de otra persona' : 'No es mío'}</span>
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
            <Muted className="px-1.5 text-[13px] leading-[18px]">Queda como plata de otros, sin persona. Podés asignarla después.</Muted>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                {relations.map((r) => (
                  <Chip key={r} active={r === rel} onClick={() => setRelation(r)}>
                    {RELATION_LABEL[r]}
                  </Chip>
                ))}
              </div>
              <div className="px-1.5 text-[13px] font-semibold text-brand-dark">{relationEffect(rel, personName ?? '', n)}</div>
            </div>
          )}
          <div>
            <Label htmlFor="evento">Evento (opcional)</Label>
            <Input id="evento" list="eventos" placeholder="Ej: Cena sábado" value={eventName} onChange={(e) => setEventName(e.target.value)} />
            <datalist id="eventos">
              {events?.filter((e) => !e.closed).map((e) => <option key={e.id} value={e.name} />)}
            </datalist>
          </div>
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

      <div className="flex flex-col gap-3.5">
        <div>
          <Label htmlFor="descripcion">Descripción (opcional)</Label>
          <Input id="descripcion" placeholder="Ej: Supermercado" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="fecha">Fecha</Label>
          <Input id="fecha" type="datetime-local" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      </div>

      <ErrorText error={save.error} />

      <div className="fixed inset-x-0 bottom-0 z-20 bg-linear-to-b from-[#EEF3F0]/0 to-[#EEF3F0]/95 to-55% px-5 pt-10 pb-[max(24px,env(safe-area-inset-bottom))] lg:static lg:bg-none lg:p-0">
        <Button type="submit" size="lg" disabled={!canSave || save.isPending} className="w-full shadow-[0_10px_24px_rgba(16,32,27,0.25)] lg:h-[52px] lg:text-sm lg:shadow-none">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

// Desktop side panel on Movimientos: stays put and resets after saving.
export function MovementPanel() {
  const [key, setKey] = useState(0)
  return (
    <Glass className="flex flex-col gap-4 rounded-[36px] p-7">
      <div className="text-lg font-bold">Nuevo movimiento</div>
      <MovementFields key={key} onSaved={() => setKey(key + 1)} />
    </Glass>
  )
}

export default function MovementFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: initial } = useApi<Movement>(id ? `/movements/${id}` : null)
  const defaults: FormDefaults = {
    type: (params.get('type') as MovementType) ?? undefined,
    personId: params.get('personId') ? Number(params.get('personId')) : undefined,
    eventName: params.get('event') ?? undefined,
    relation: (params.get('relation') as Relation) ?? undefined,
  }
  const back = params.get('back') ?? (id ? `/movimientos/${id}` : '/movimientos')

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex h-12 shrink-0 items-center gap-2">
        <Link to={back} aria-label="Cerrar" className="-ml-2.5 flex size-11 items-center justify-center">
          <X className="size-6" strokeWidth={1.75} />
        </Link>
        <h1 className="text-xl font-bold">{id ? 'Editar movimiento' : 'Nuevo movimiento'}</h1>
      </div>
      {id && !initial ? (
        <Loading />
      ) : (
        <MovementFields initial={initial} defaults={defaults} onSaved={(m) => navigate(params.get('back') ?? `/movimientos/${m.id}`)} />
      )}
    </div>
  )
}
