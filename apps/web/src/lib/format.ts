import type { AccountType, Movement, Person, Relation } from './api'

export const money = (n: number) => `$ ${Math.abs(n).toLocaleString('es-AR')}`
// Account balances can go below zero; owed amounts use money() and say the direction in words.
export const signed = (n: number) => (n < 0 ? `− ${money(n)}` : money(n))

// Parses "25.000" / "$ 25.000" into 25000.
export const parseMoney = (s: string) => Number(s.replace(/\D/g, '')) || 0
export const moneyInput = (s: string) => {
  const n = parseMoney(s)
  return n ? n.toLocaleString('es-AR') : ''
}

const pad = (n: number) => String(n).padStart(2, '0')
export const localDateTime = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const currentMonth = () => localDateTime().slice(0, 7)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const parse = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00` : iso)

export const longToday = () => cap(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))
export const monthName = (month: string) => cap(parse(`${month}-01`).toLocaleDateString('es-AR', { month: 'long' }))
export const dayMonth = (iso: string) => parse(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export const daysAgo = (iso: string) => {
  const today = parse(localDateTime().slice(0, 10)).getTime()
  return Math.round((today - parse(iso.slice(0, 10)).getTime()) / 86_400_000)
}

export const dateTimeLabel = (iso: string) => {
  const d = daysAgo(iso)
  const day = d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : dayMonth(iso)
  return `${day}, ${iso.slice(11, 16)}`
}

// "Hoy" / "Esta semana" / "Este mes" / "Septiembre 2026"
export const dateGroup = (iso: string) => {
  const d = daysAgo(iso)
  if (d <= 0) return 'Hoy'
  if (d < 7) return 'Esta semana'
  if (iso.slice(0, 7) === currentMonth()) return 'Este mes'
  return `${monthName(iso.slice(0, 7))} ${iso.slice(0, 4)}`
}

export const ACCOUNT_LABEL: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Cuenta bancaria',
  wallet: 'Billetera',
  credit_card: 'Crédito · deuda',
}

export const RELATION_LABEL: Record<Relation, string> = {
  passed_to_spend: 'Me pasó para gastar',
  returned_to_me: 'Me devolvió',
  lent_to_me: 'Me prestó',
  advanced: 'Le presté o pagué por',
  returned: 'Le devolví',
}

export const INCOME_RELATIONS = ['passed_to_spend', 'returned_to_me', 'lent_to_me'] as const

// What a movement does to the balance with that person, as the form previews it.
export function relationEffect(relation: Relation, name: string, amount: number) {
  const m = money(amount)
  switch (relation) {
    case 'passed_to_spend':
    case 'lent_to_me':
      return `Le debés ${m} más a ${name}.`
    case 'returned_to_me':
      return `${name} te debe ${m} menos.`
    case 'advanced':
      return `${name} te debe ${m} más.`
    case 'returned':
      return `Le debés ${m} menos a ${name}.`
  }
}

export const isGroup = (p: Pick<Person, 'kind'>) => p.kind === 'group'

// Positive balance = they owe you.
export const balanceDir = (balance: number, p: Pick<Person, 'kind'>) =>
  balance < 0 ? (isGroup(p) ? 'les debés' : 'le debés') : balance > 0 ? (isGroup(p) ? 'te deben' : 'te debe') : 'a mano'

export const initials = (name: string) => {
  const words = name.trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

export function movementTitle(m: Movement) {
  if (m.description) return m.description
  if (m.type === 'transfer') return 'Transferencia'
  if (m.relation) return RELATION_LABEL[m.relation]
  return m.category?.name ?? (m.type === 'income' ? 'Ingreso' : 'Egreso')
}

export function movementSub(m: Movement) {
  if (m.type === 'transfer') return `${m.account.name} → ${m.toAccount?.name ?? ''}`
  if (!m.isOthers) return m.event ? `${m.account.name} · ${m.event.name}` : m.account.name
  const p = m.person?.name
  if (!p) return `${m.account.name} · ${m.type === 'expense' ? 'te deben' : 'plata de otros'}`
  const tail: Record<Relation, string> = {
    passed_to_spend: `plata de ${p}`,
    lent_to_me: `préstamo de ${p}`,
    returned_to_me: `${p} te devolvió`,
    advanced: `${p} te debe`,
    returned: `le devolviste a ${p}`,
  }
  return `${m.account.name} · ${m.relation ? tail[m.relation] : p}`
}

export const signedMoney = (m: Pick<Movement, 'type' | 'amount'>) =>
  m.type === 'income' ? `+ ${money(m.amount)}` : m.type === 'expense' ? `− ${money(m.amount)}` : money(m.amount)

// Upcoming payments: overdue ones stand out, the next few days get a light accent.
export function dueState(dueDate: string) {
  const days = -daysAgo(dueDate)
  if (days < 0) return { tone: 'overdue' as const, label: `Venció el ${shortDate(dueDate)}` }
  if (days <= 5) return { tone: 'soon' as const, label: days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días` }
  return { tone: 'later' as const, label: `Vence el ${shortDate(dueDate)}` }
}

export const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? ''))

export const amountColor = (m: Pick<Movement, 'type' | 'isOthers'>) =>
  m.type === 'transfer' ? 'text-transfer' : m.type === 'expense' ? 'text-foreground' : m.isOthers ? 'text-others' : 'text-income'
