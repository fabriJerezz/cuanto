import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover } from "radix-ui"
import * as React from "react"
import { cn } from "cn"

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const WEEK = ["L", "M", "M", "J", "V", "S", "D"]

// Day-only picker ('YYYY-MM-DD'): the whole field opens a calendar styled like the rest of the app.
function DateField({ value, onChange, id, className }: { value: string; onChange: (v: string) => void; id?: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => parse(value))
  const today = iso(new Date())
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const blanks = (first.getDay() + 6) % 7 // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <Popover.Root
      modal
      open={open}
      onOpenChange={(o) => {
        if (o) setMonth(parse(value))
        setOpen(o)
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          data-slot="input"
          className={cn(
            "press flex h-[52px] w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-white/90 bg-white/55 px-[18px] text-left text-[15px] font-semibold outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 data-[state=open]:border-brand data-[state=open]:ring-3 data-[state=open]:ring-brand/20",
            className
          )}
        >
          {parse(value).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
          <CalendarDays className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[296px] origin-(--radix-popover-content-transform-origin) rounded-[22px] border border-white/90 bg-white/85 p-3 shadow-[0_16px_40px_rgba(20,50,40,0.18)] backdrop-blur-2xl backdrop-saturate-170 duration-200 ease-apple outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)} className="flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-brand/10">
              <ChevronLeft className="size-5" strokeWidth={1.75} />
            </button>
            <div className="text-sm font-bold capitalize">{month.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</div>
            <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)} className="flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-brand/10">
              <ChevronRight className="size-5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEK.map((w, i) => (
              <div key={i} className="pb-1 text-xs font-bold text-muted-foreground">
                {w}
              </div>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const v = iso(new Date(month.getFullYear(), month.getMonth(), i + 1))
              const selected = v === value
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pick(v)}
                  className={cn(
                    "press mx-auto flex size-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold",
                    selected ? "bg-foreground text-white" : "hover:bg-brand/10",
                    v === today && !selected && "text-brand ring-1 ring-brand/50"
                  )}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => pick(today)} className="press mt-2 h-9 w-full cursor-pointer rounded-full text-sm font-bold text-brand hover:bg-brand/10">
            Hoy
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { DateField }
