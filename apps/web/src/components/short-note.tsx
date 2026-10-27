import { Collapse } from '@/components/kit'
import { useApi, type Summary } from '@/lib/api'
import { currentMonth, money } from '@/lib/format'

// Warns when an amount is more than the account has free (after pending payments and other people's
// money): the free money goes negative, by what's missing to cover the pending payments.
// credit: what this same record already took out of the account (when editing).
export function ShortNote({ accountId, amount, credit = 0 }: { accountId?: number; amount: number; credit?: number }) {
  const { data: summary } = useApi<Summary>(`/summary?month=${currentMonth()}`)
  const account = summary?.accounts.find((a) => a.id === accountId)
  const free = account?.split ? account.split.free + credit : null
  const short = free != null && amount > free ? amount - free : 0
  return (
    <Collapse open={short > 0}>
      <div role="status" className="rounded-[20px] bg-[#F0C9A4]/45 px-4 py-2.5 text-[13px] leading-[18px] font-semibold text-[#8A5A1E]">
        Superás lo libre de {account?.name} ({money(free ?? 0)}). Faltarían {money(short)} para cubrir los pagos pendientes: tu plata libre queda en negativo.
      </div>
    </Collapse>
  )
}
