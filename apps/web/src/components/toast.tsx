import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

let push: (message: string) => void = () => {}
// Short notice at the bottom of the screen (5 s). Call from anywhere; <Toaster /> renders it.
export const notify = (message: string) => push(message)

export function Toaster() {
  const [message, setMessage] = useState('')
  const [shown, setShown] = useState(false)
  const timer = useRef(0)
  useEffect(() => {
    push = (m) => {
      setMessage(m)
      setShown(true)
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setShown(false), 5000)
    }
    return () => {
      push = () => {}
      clearTimeout(timer.current)
    }
  }, [])
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-5 transition-[opacity,translate] duration-300 ease-apple lg:bottom-8',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
    >
      <div className="max-w-md rounded-[22px] border border-white/90 bg-[#F6E3CE]/95 px-5 py-3 text-sm font-semibold text-[#8A5A1E] shadow-[0_12px_32px_rgba(20,50,40,0.16)] backdrop-blur-xl">{message}</div>
    </div>
  )
}
