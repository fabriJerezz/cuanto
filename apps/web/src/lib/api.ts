import { QueryCache, QueryClient, useMutation, useQuery } from '@tanstack/react-query'

export type AccountType = 'cash' | 'bank' | 'wallet' | 'credit_card'
export type MovementType = 'income' | 'expense' | 'transfer'
export type IncomeRelation = 'passed_to_spend' | 'returned_to_me' | 'lent_to_me'
export type ExpenseRelation = 'advanced' | 'returned'
export type Relation = IncomeRelation | ExpenseRelation

export interface Account {
  id: number
  name: string
  type: AccountType
  initialBalance: number
  dueDay: number | null
  balance: number
}
export interface Person {
  id: number
  name: string
  kind: 'person' | 'group'
}
export interface PersonRow extends Person {
  balance: number
  lastMovementDate: string | null
  eventName: string | null
}
export interface EventItem {
  id: number
  name: string
  people: Person[]
  includeMe: boolean
  closed: boolean
  balance: number
}
export interface Category {
  id: number
  name: string
  monthlyLimit: number
}
export interface FixedExpense {
  id: number
  name: string
  amount: number
  dayOfMonth: number
  accountId: number
  account: Account
}
export interface Movement {
  id: number
  type: MovementType
  amount: number
  description: string
  date: string
  accountId: number
  account: Account
  toAccountId: number | null
  toAccount: Account | null
  categoryId: number | null
  category: Category | null
  isOthers: boolean
  personId: number | null
  person: Person | null
  relation: Relation | null
  eventId: number | null
  event: EventItem | null
  fixedExpenseId: number | null
}
export interface Rendition {
  balance: number
  received: number
  spent: number
}
// share: this person's part of a shared event expense (null for their own movements).
export type PersonDetail = Person & Rendition & { events: EventItem[]; movements: (Movement & { share: number | null })[] }
export type EventDetail = Omit<EventItem, 'people'> &
  Rendition & { people: (Person & { balance: number })[]; movements: (Movement & { myShare: number | null })[] }
export type CategoryDetail = Category & { month: string; spent: number; movements: (Movement & { myShare: number })[] }

export interface Payment {
  kind: 'fixed' | 'card'
  id: number
  name: string
  amount: number
  dueDate: string
  accountId: number
  paid: boolean
  movementId: number | null
}
export interface Summary {
  month: string
  free: number
  totalInAccounts: number
  cardDebt: number
  accounts: { id: number; name: string; type: AccountType; balance: number; pct: number | null }[]
  owners: { free: number; pending: number; others: number; freePct: number; pendingPct: number; othersPct: number }
  payments: Payment[]
  pendingTotal: number
  owe: number
  owed: number
  budgets: { id: number; name: string; limit: number; spent: number }[]
  budgetSpent: number
  budgetLimit: number
  eventsWithOthers: { count: number; amount: number }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join('. ') : err.message
    throw new ApiError(msg ?? `Error ${res.status}`, res.status)
  }
  const text = await res.text()
  // Empty bodies (204) resolve to null: TanStack Query rejects undefined data.
  return text ? JSON.parse(text) : (null as T)
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: (url: string) => request<void>('DELETE', url),
}

const unauthorized = (e: unknown) => e instanceof ApiError && e.status === 401

export const queryClient: QueryClient = new QueryClient({
  // A 401 anywhere (session expired, PIN changed) sends you back to the PIN screen.
  queryCache: new QueryCache({
    onError: (e, q) => unauthorized(e) && q.queryKey[0] !== '/auth/me' && queryClient.invalidateQueries({ queryKey: ['/auth/me'] }),
  }),
  defaultOptions: { queries: { staleTime: 10_000, retry: (n, e) => !unauthorized(e) && n < 2 } },
})

// The query key is the URL, so any page can read any endpoint without a hook per resource.
export function useApi<T>(url: string | null) {
  return useQuery({
    queryKey: [url],
    queryFn: () => api.get<T>(url!),
    enabled: url != null,
  })
}

// Every write can move balances anywhere, so it refreshes everything.
export function useSave<A, R = unknown>(fn: (arg: A) => Promise<R>) {
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries() })
}
