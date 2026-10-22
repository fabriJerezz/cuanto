import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackTitle, Glass, Loading, Muted, PageTitle, Row, Segmented, segmentClass } from '@/components/kit'
import { Button, buttonVariants } from '@/components/ui/button'
import { api, useApi, useSave, type Movement } from '@/lib/api'
import { RELATION_LABEL, amountColor, dateGroup, dateTimeLabel, money, movementSub, movementTitle, signedMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MovementPanel } from './movement-form'

const FILTERS = [
  ['all', 'Todos'],
  ['mine', 'Míos'],
  ['others', 'De otros'],
] as const

export function MovementRows({ movements, empty = 'No hay movimientos.' }: { movements: Movement[]; empty?: string }) {
  if (!movements.length) return <Row className="text-sm text-muted-foreground">{empty}</Row>
  return movements.map((m) => (
    <Link key={m.id} to={`/movimientos/${m.id}`} className="flex min-h-15 items-center gap-3 border-line [&+&]:border-t">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{movementTitle(m)}</div>
        <div className="text-xs text-muted-foreground">{dateTimeLabel(m.date).split(',')[0]} · {movementSub(m)}</div>
      </div>
      <div className={cn('num text-[15px] font-bold', amountColor(m))}>{signedMoney(m)}</div>
    </Link>
  ))
}

export default function Movements() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all')
  const { data } = useApi<Movement[]>(`/movements${filter === 'all' ? '' : `?filter=${filter}`}`)

  let last = ''
  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PageTitle>Movimientos</PageTitle>
          <Segmented className="w-full lg:w-auto">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={segmentClass(filter === id)}>
                {label}
              </button>
            ))}
          </Segmented>
        </div>
        <Glass className="px-[22px] pt-1 pb-2 lg:px-7">
          {!data && <Loading />}
          {data?.length === 0 && <Row className="text-sm text-muted-foreground">No hay movimientos.</Row>}
          {data?.map((m) => {
            const group = dateGroup(m.date)
            const showGroup = group !== last
            last = group
            return (
              <div key={m.id}>
                {showGroup && <div className="pt-4 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{group}</div>}
                <Link to={`/movimientos/${m.id}`} className={cn('flex min-h-15 items-center gap-3 lg:min-h-16', !showGroup && 'border-t border-line')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{movementTitle(m)}</div>
                    <div className="text-xs text-muted-foreground">{movementSub(m)}</div>
                  </div>
                  <div className={cn('num text-[15px] font-bold', amountColor(m))}>{signedMoney(m)}</div>
                </Link>
              </div>
            )
          })}
        </Glass>
      </div>
      <div className="hidden min-w-0 flex-[2_1_340px] lg:block">
        <MovementPanel />
      </div>
    </div>
  )
}

export function MovementDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
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
    ['Fecha', dateTimeLabel(shown.date)],
    ...(shown.isOthers || shown.type === 'transfer' ? [] : [['Categoría', shown.category?.name ?? 'Sin categoría']]),
    ...(shown.type === 'transfer' ? [] : [['Persona', shown.person?.name ?? 'Sin asignar']]),
    ...(shown.isOthers ? [['Evento', shown.event?.name ?? 'Sin evento']] : []),
  ]

  return (
    <>
      <BackTitle to="/movimientos" label="Movimientos">
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
          {deleted ? (
            <Glass className="p-7">
              <div className="text-lg font-bold">Movimiento eliminado</div>
              <Muted className="mt-1.5">{didUndo} y tu plata libre se actualizó.</Muted>
              <Link to="/movimientos" className={cn(buttonVariants(), 'mt-[18px]')}>
                Volver a Movimientos
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
              <Button onClick={() => navigate(`/movimientos/${id}/editar`)}>Editar</Button>
              <Button variant="glass" className="text-danger" onClick={() => setConfirm(true)}>
                Eliminar
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
