import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ErrorText, Glass, Label } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, queryClient, type Account, type Summary } from '@/lib/api'
import { currentMonth, money, moneyInput, parseMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    title: 'Armá tu plata',
    sub: 'Cargá lo que tenés hoy en cada cuenta. Después podés agregar más en Configuración.',
    fields: [
      { id: 'cash', label: 'Efectivo', ph: '$ 0', money: true },
      { id: 'bank', label: 'Banco', ph: '$ 0', money: true },
      { id: 'wallet', label: 'Billetera virtual', ph: '$ 0', money: true },
    ],
  },
  {
    title: 'Pagos de todos los meses',
    sub: 'Alquiler, servicios, suscripciones. Aparecen solos como pendientes cada mes.',
    fields: [
      { id: 'fx-name', label: 'Nombre', ph: 'Ej: Alquiler', money: false },
      { id: 'fx-amount', label: 'Monto', ph: '$ 0', money: true },
      { id: 'fx-day', label: 'Día del mes', ph: '1 a 31', money: false },
    ],
  },
  { title: 'Todo listo', sub: 'Tu plata libre real ya se calcula con lo que cargaste. Cada movimiento nuevo la actualiza.', fields: [] },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [v, setV] = useState<Record<string, string>>({})
  const [free, setFree] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const d = STEPS[step]

  // Each step saves on "Continuar"; going back and forth never creates things twice.
  const next = async () => {
    setBusy(true)
    setError(null)
    try {
      if (step === 0) {
        const existing = await api.get<Account[]>('/accounts')
        if (!existing.length)
          for (const [type, name] of [['cash', 'Efectivo'], ['bank', 'Banco'], ['wallet', 'Billetera virtual']])
            await api.post('/accounts', { name, type, initialBalance: parseMoney(v[type] ?? '') })
      }
      if (step === 1 && v['fx-name']?.trim() && parseMoney(v['fx-amount'] ?? '') && !v.fxSaved) {
        const accounts = await api.get<Account[]>('/accounts')
        const day = Math.min(31, Math.max(1, Number(v['fx-day']) || 1))
        const bank = accounts.find((a) => a.type === 'bank') ?? accounts[0]
        await api.post('/fixed-expenses', { name: v['fx-name'].trim(), amount: parseMoney(v['fx-amount']), dayOfMonth: day, accountId: bank.id })
        setV((p) => ({ ...p, fxSaved: '1' }))
      }
      if (step === 1) setFree((await api.get<Summary>(`/summary?month=${currentMonth()}`)).free)
      setStep(step + 1)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    await queryClient.invalidateQueries()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <Glass className="flex w-full max-w-[520px] flex-col gap-6 rounded-[36px] p-8 lg:p-10">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-foreground/10')} />
          ))}
        </div>
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">{d.title}</h1>
          <p className="mt-1.5 text-[15px] leading-[22px] text-muted-foreground">{d.sub}</p>
        </div>
        {d.fields.length > 0 && (
          <div className="flex flex-col gap-3.5">
            {d.fields.map((f) => (
              <div key={f.id}>
                <Label htmlFor={`b-${f.id}`} className="mb-1.5">
                  {f.label}
                </Label>
                <Input
                  id={`b-${f.id}`}
                  inputMode={f.id === 'fx-name' ? undefined : 'numeric'}
                  placeholder={f.ph}
                  disabled={step === 0 && busy}
                  value={f.money && v[f.id] ? `$ ${v[f.id]}` : (v[f.id] ?? '')}
                  onChange={(e) => {
                    const raw = e.target.value
                    setV((p) => ({ ...p, [f.id]: f.money ? moneyInput(raw) : f.id === 'fx-day' ? raw.replace(/\D/g, '') : raw }))
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {step === 2 && free !== null && (
          <div className="hero rounded-[28px] px-6 py-5">
            <div className="text-sm font-semibold text-brand-soft">Plata libre real</div>
            <div className="num text-[40px] font-bold tracking-[-0.03em]">{money(free)}</div>
          </div>
        )}
        <ErrorText error={error} />
        <div className="flex justify-between gap-2.5">
          <Button variant="glass" className={cn(step === 0 && 'invisible')} onClick={() => setStep(Math.max(0, step - 1))}>
            Atrás
          </Button>
          {step < 2 ? (
            <Button disabled={busy} onClick={next}>
              Continuar
            </Button>
          ) : (
            <Button onClick={finish}>Ir al inicio</Button>
          )}
        </div>
      </Glass>
    </div>
  )
}
