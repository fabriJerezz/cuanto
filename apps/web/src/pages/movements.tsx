import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { BackTitle, Glass, Loading, Muted, Row, Segmented, segmentClass } from '@/components/kit'
import { Button, buttonVariants } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { api, useApi, useSave, type Movement } from '@/lib/api'
import { RELATION_LABEL, amountColor, dateGroup, dateTimeLabel, money, movementSub, movementTitle, signedMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMovementForm } from './movement-form'

const FILTERS = [
  ['all', 'Todos'],
  ['mine', 'Míos'],
  ['others', 'De otros'],
] as const
const PAGE = 10

// amountOf: show part of the movement instead (your share of a shared expense, someone's part).
export function MovementRows<M extends Movement>({ movements, empty = 'No hay movimientos.', amountOf }: { movements: M[]; empty?: string; amountOf?: (m: M) => number | null }) {
  if (!movements.length) return <Row className="text-sm text-muted-foreground">{empty}</Row>
  return movements.map((m) => {
    const part = amountOf?.(m)
    const shown = part != null && part !== m.amount
    return (
      <Link key={m.id} to={`/movimientos/${m.id}`} className="flex min-h-15 items-center gap-3 border-line [&+&]:border-t">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{movementTitle(m)}</div>
          <div className="text-xs text-muted-foreground">
            {dateTimeLabel(m.date).split(',')[0]} · {shown ? `parte de ${money(m.amount)}` : movementSub(m)}
          </div>
        </div>
        <div className={cn('num text-[15px] font-bold', amountColor(m))}>{signedMoney(shown ? { ...m, amount: part } : m)}</div>
      </Link>
    )
  })
}

// Every movement, grouped by date, with the Todos/Míos/De otros filter. Lives on Inicio.
export function MovementsTable({ className }: { className?: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all')
  const [shown, setShown] = useState(PAGE)
  const { data } = useApi<Movement[]>(`/movements${filter === 'all' ? '' : `?filter=${filter}`}`)
  const openForm = useMovementForm()
  const remove = useSave((id: number) => api.del(`/movements/${id}`))
  // Infinite scroll: 10 more each time the end of the list comes into view.
  const more = !!data && data.length > shown
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!more) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '200px' })
    io.observe(end.current!)
    return () => io.disconnect()
  }, [more, shown])

  let last = ''
  return (
    <Glass className={cn('px-[22px] pt-4 pb-2 lg:rounded-[36px] lg:px-7 lg:pt-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold lg:text-[15px]">Movimientos</h2>
        <Segmented className="w-full sm:w-auto">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id)
                setShown(PAGE)
              }}
              className={cn(segmentClass(filter === id), 'h-9 px-4')}
            >
              {label}
            </button>
          ))}
        </Segmented>
      </div>
      {!data && <Loading />}
      {data?.length === 0 && <Row className="text-sm text-muted-foreground">No hay movimientos.</Row>}
      {data?.slice(0, shown).map((m) => {
        const group = dateGroup(m.date)
        const showGroup = group !== last
        last = group
        return (
          <div key={m.id}>
            {showGroup && <div className="pt-4 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{group}</div>}
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Link to={`/movimientos/${m.id}`} className={cn('flex min-h-15 items-center gap-3 lg:min-h-16', !showGroup && 'border-t border-line')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{movementTitle(m)}</div>
                    <div className="text-xs text-muted-foreground">{movementSub(m)}</div>
                  </div>
                  <div className={cn('num text-[15px] font-bold', amountColor(m))}>{signedMoney(m)}</div>
                </Link>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => openForm({ initial: m })}>
                  <Pencil /> Editar
                </ContextMenuItem>
                <ContextMenuItem destructive onSelect={() => remove.mutate(m.id)}>
                  <Trash2 /> Eliminar
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        )
      })}
      {more && <div ref={end} className="h-10" aria-hidden="true" />}
    </Glass>
  )
}

export function MovementDetail() {
  const { id } = useParams()
  const openForm = useMovementForm()
  const { data: m } = useApi<Movement>(`/movements/${id}`)
  const [confirm, setConfirm] = useState(false)
  const [deleted, setDeleted] = useState<Movement | null>(null)
  const remove = useSave(() => api.del(`/movements/${id}`))

  const shown = deleted ?? m
  if (!shown) return <Loading />

  const kind = shown.type === 'income' ? 'Ingreso' : shown.type === 'expense' ? 'Egreso' : 'Transferencia'
  const tag = shown.category?.name ?? (shown.relation ? RELATION_LABEL[shown.relation] : shown.isOthers ? 'Plata de otros' : null)
  const amt = money(shown.amount)
  const acc = shown.account.name
  const [willUndo, didUndo] =
    shown.type === 'income'
      ? [`Se restan ${amt} de ${acc}`, `Los ${amt} salieron de ${acc}`]
      : [`Se devuelven ${amt} a ${acc}`, `Los ${amt} volvieron a ${acc}`]
  const fields = [
    ['Cuenta', shown.type === 'transfer' ? movementSub(shown) : shown.account.name],
    ['Fecha', dateTimeLabel(shown.date).split(',')[0]],
    ...(shown.isOthers || shown.type === 'transfer' ? [] : [['Categoría', shown.category?.name ?? 'Sin categoría']]),
    ...(shown.isOthers ? [['Persona', shown.person?.name ?? 'Sin asignar']] : []),
    ...(shown.type === 'transfer' ? [] : [['Evento', shown.event?.name ?? 'Sin evento']]),
  ]

  return (
    <>
      <BackTitle to="/" label="Inicio">
        Movimiento
      </BackTitle>
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Glass className="px-[26px] py-7 lg:rounded-[36px] lg:px-9 lg:py-8">
            <div className="text-sm font-semibold text-muted-foreground">{[kind, tag].filter(Boolean).join(' · ')}</div>
            <div className={cn('num text-5xl leading-[58px] font-bold tracking-[-0.03em] lg:text-[56px] lg:leading-[66px]', amountColor(shown))}>
              {signedMoney(shown)}
            </div>
            <div className="text-[15px] text-muted-foreground">{movementTitle(shown)}</div>
          </Glass>
          <Glass className="px-7 py-1">
            {fields.map(([k, v]) => (
              <Row key={k}>
                <div className="flex-1 text-sm text-muted-foreground">{k}</div>
                <div className="text-right text-[15px] font-semibold">{v}</div>
              </Row>
            ))}
          </Glass>
        </div>
        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-3.5">
          <div key={deleted ? 'd' : confirm ? 'c' : 'a'} className="animate-in duration-500 ease-apple fade-in-0 slide-in-from-bottom-2">
          {deleted ? (
            <Glass className="p-7">
              <div className="text-lg font-bold">Movimiento eliminado</div>
              <Muted className="mt-1.5">{didUndo} y tu plata libre se actualizó.</Muted>
              <Link to="/" className={cn(buttonVariants(), 'mt-[18px]')}>
                Volver al inicio
              </Link>
            </Glass>
          ) : confirm ? (
            <Glass className="px-6 py-[22px]">
              <div className="text-[15px] font-bold">¿Eliminar este movimiento?</div>
              <Muted className="mt-1 text-[13px] leading-[19px]">{willUndo}. No se puede deshacer.</Muted>
              <div className="mt-4 flex gap-2.5">
                <Button variant="danger" className="h-12" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => setDeleted(m!) })}>
                  Sí, eliminar
                </Button>
                <Button variant="glass" className="h-12" onClick={() => setConfirm(false)}>
                  Cancelar
                </Button>
              </div>
            </Glass>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              <Button onClick={() => openForm({ initial: m })}>Editar</Button>
              <Button variant="glass" className="text-danger" onClick={() => setConfirm(true)}>
                Eliminar
              </Button>
            </div>
          )}
          </div>
        </div>
      </div>
    </>
  )
}
