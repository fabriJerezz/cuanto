import { ChevronLeft } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function Glass({ className, soft, ...props }: ComponentProps<'div'> & { soft?: boolean }) {
  return <div className={cn(soft ? 'glass-soft' : 'glass', 'rounded-[28px] lg:rounded-[32px]', className)} {...props} />
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3">
      <h1 className="text-[28px] font-bold tracking-[-0.02em] lg:text-[32px]">{children}</h1>
      {action}
    </div>
  )
}

// Mobile: round chevron next to the title. Desktop: "← Section" text link.
export function BackTitle({ to, label, children }: { to: string; label: string; children?: ReactNode }) {
  return (
    <>
      <Link to={to} className="hidden min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground lg:inline-flex">
        ← {label}
      </Link>
      {children && (
        <div className="flex h-12 shrink-0 items-center gap-2 lg:hidden">
          <Link to={to} aria-label={`Volver a ${label}`} className="-ml-2.5 flex size-11 items-center justify-center">
            <ChevronLeft className="size-6" strokeWidth={1.75} />
          </Link>
          <h1 className="text-xl font-bold">{children}</h1>
        </div>
      )}
    </>
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-2 block text-[13px] font-semibold text-muted-foreground', className)} {...props} />
}

export function Caption({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-2 block text-[13px] font-semibold text-muted-foreground', className)} {...props} />
}

export function Chip({ active, className, ...props }: ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'h-11 shrink-0 cursor-pointer rounded-full border px-[18px] text-sm font-semibold transition-colors',
        active ? 'border-brand bg-brand text-white' : 'border-white/90 bg-white/52 text-foreground hover:bg-white/70',
        className,
      )}
      {...props}
    />
  )
}

// Dark selected state, used for filters and section tabs.
export function Tab({ active, className, ...props }: ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'h-11 shrink-0 cursor-pointer rounded-full px-[18px] text-sm lg:px-5',
        active ? 'bg-foreground font-bold text-white' : 'border border-white/90 bg-white/52 font-semibold',
        className,
      )}
      {...props}
    />
  )
}

// Pill track with a white sliding "thumb": Todos/Míos/De otros, Pagos/Presupuestos.
export function Segmented({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex shrink-0 gap-1 rounded-[26px] border border-white/85 bg-white/50 p-1 backdrop-blur-xl', className)}>
      {children}
    </div>
  )
}
export const segmentClass = (active: boolean) =>
  cn(
    'flex h-11 flex-1 cursor-pointer items-center justify-center rounded-full px-5 text-sm whitespace-nowrap',
    active ? 'bg-white font-bold shadow-[0_2px_8px_rgba(20,50,40,0.1)]' : 'font-semibold text-muted-foreground',
  )

export function Row({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-h-15 items-center gap-3 [&+&]:border-t [&+&]:border-line', className)} {...props} />
}

export function Bar({ pct, warn, label, className }: { pct: number; warn?: boolean; label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cn('h-1.5 overflow-hidden rounded-full bg-foreground/8', className)}>
      <div className={cn('h-full rounded-full', warn ? 'bg-owe' : 'bg-brand')} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

export function Muted({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-sm leading-5 text-muted-foreground', className)} {...props} />
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="px-1.5 text-[13px] font-semibold text-danger">{error instanceof Error ? error.message : 'Algo salió mal'}</div>
}

export function Loading() {
  return <Muted className="py-10 text-center">Cargando…</Muted>
}
