import * as React from "react"
import { cn } from "cn"
import { ContextMenu as Primitive } from "radix-ui"

const ContextMenu = Primitive.Root
const ContextMenuTrigger = Primitive.Trigger

function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={cn(
          "z-50 min-w-48 origin-(--radix-context-menu-content-transform-origin) rounded-[20px] border border-white/90 bg-white/80 p-1.5 shadow-[0_16px_40px_rgba(20,50,40,0.18)] backdrop-blur-2xl backdrop-saturate-170 duration-200 ease-apple data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

function ContextMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[14px] py-1.5 px-3.5 text-sm font-semibold outline-none transition-colors duration-150 select-none [&_svg]:size-[18px] [&_svg]:shrink-0",
        destructive ? "text-danger data-highlighted:bg-danger/10" : "data-highlighted:bg-brand/10 data-highlighted:text-brand-dark",
        className
      )}
      {...props}
    />
  )
}

export { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger }
