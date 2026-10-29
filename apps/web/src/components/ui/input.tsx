import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[52px] w-full min-w-0 rounded-full border border-white/90 bg-white/55 px-[18px] text-[15px] font-semibold text-foreground transition-[border-color,box-shadow,background-color] duration-300 ease-apple outline-none placeholder:font-medium placeholder:text-muted-foreground focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
