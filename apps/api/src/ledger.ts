import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Account, Category, Event, FixedExpense, Movement, Person, SkippedPayment } from './entities.js';

type Mv = Pick<
  Movement,
  'type' | 'amount' | 'accountId' | 'toAccountId' | 'isOthers' | 'personId' | 'eventId' | 'categoryId' | 'fixedExpenseId' | 'date'
>;

export function accountBalances(accounts: Pick<Account, 'id' | 'initialBalance'>[], movements: Mv[]) {
  const bal = new Map(accounts.map((a) => [a.id, a.initialBalance]));
  const add = (id: number | null, n: number) => id != null && bal.set(id, (bal.get(id) ?? 0) + n);
  for (const m of movements) {
    if (m.type === 'income') add(m.accountId, m.amount);
    else add(m.accountId, -m.amount);
    if (m.type === 'transfer') add(m.toAccountId, m.amount);
  }
  return bal;
}

// What someone else's money does to the balance with them. Positive = they owe you.
// Lending or paying them back moves it up; money they hand you (to spend, as a loan or
// paying you back) moves it down.
export function othersDelta(m: Mv) {
  if (!m.isOthers || m.type === 'transfer') return 0;
  return m.type === 'expense' ? m.amount : -m.amount;
}

type EventLite = Pick<Event, 'id' | 'includeMe'> & { people: Pick<Person, 'id'>[] };

// Each person's part of a shared event expense, split equally among the event's people
// (plus you when includeMe). You absorb the rounding when you take part; otherwise the
// first people pay one peso more.
export function eventShares(m: Mv, ev: EventLite | undefined) {
  const out = new Map<number, number>();
  if (!ev?.people.length || m.type !== 'expense' || m.isOthers) return out;
  const ids = ev.people.map((p) => p.id).sort((a, b) => a - b);
  const n = ids.length + (ev.includeMe ? 1 : 0);
  const base = Math.floor(m.amount / n);
  let rem = ev.includeMe ? 0 : m.amount - base * n;
  for (const id of ids) out.set(id, base + (rem-- > 0 ? 1 : 0));
  return out;
}

export const myShare = (m: Mv, ev: EventLite | undefined) =>
  m.amount - [...eventShares(m, ev).values()].reduce((s, n) => s + n, 0);

// An event's unpaid planned payment counts as if the expense were already made, only to work out who
// owes what (never for account balances). Once it's paid, the real movement takes its place.
export function plannedExpenses(fixed: Pick<FixedExpense, 'id' | 'amount' | 'accountId' | 'eventId'>[], paidIds: Set<number | null>): Mv[] {
  return fixed
    .filter((f) => f.eventId != null && !paidIds.has(f.id))
    .map((f) => ({
      type: 'expense' as const,
      amount: f.amount,
      accountId: f.accountId,
      toAccountId: null,
      isOthers: false,
      personId: null,
      eventId: f.eventId,
      categoryId: null,
      fixedExpenseId: f.id,
      date: '',
    }));
}

// Balance with each person (null = others' money with nobody assigned) and per event.
export function balances(movements: Mv[], events: EventLite[]) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const person = new Map<number | null, number>();
  const event = new Map<number, number>();
  const add = <K>(map: Map<K, number>, k: K, n: number) => n && map.set(k, (map.get(k) ?? 0) + n);
  for (const m of movements) {
    const d = othersDelta(m);
    add(person, m.personId, d);
    if (m.eventId != null) add(event, m.eventId, d);
    for (const [pid, share] of eventShares(m, m.eventId == null ? undefined : byId.get(m.eventId))) {
      add(person, pid, share);
      add(event, m.eventId!, share);
    }
  }
  return { person, event };
}

// Money they handed you vs. what was spent on their behalf ("te pasó X, gastaste Y").
export function rendition<T extends Mv & Pick<Movement, 'relation'>>(movements: T[], shareOf: (m: T) => number) {
  let received = 0;
  let spent = 0;
  for (const m of movements) {
    if (m.relation === 'passed_to_spend' || m.relation === 'lent_to_me') received += m.amount;
    spent += shareOf(m);
  }
  return { received, spent };
}

export const monthOf = (date: string) => date.slice(0, 7);

function dueDate(month: string, day: number) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export interface SummaryInput {
  month: string;
  accounts: Account[];
  people: Person[];
  events: Event[];
  categories: Category[];
  fixedExpenses: FixedExpense[];
  movements: Movement[];
  skipped?: Pick<SkippedPayment, 'fixedExpenseId' | 'month'>[];
  planned?: Mv[];
}

export function summarize({ month, accounts, people, events, categories, fixedExpenses, movements, skipped = [], planned = [] }: SummaryInput) {
  const bal = accountBalances(accounts, movements);
  const inMonth = movements.filter((m) => monthOf(m.date) === month);

  const money = accounts.filter((a) => a.type !== 'credit_card');
  const totalInAccounts = money.reduce((s, a) => s + bal.get(a.id)!, 0);

  const payments = [
    ...fixedExpenses.filter((f) => !f.month || f.month === month).map((f) => {
      const paidWith = inMonth.find((m) => m.fixedExpenseId === f.id);
      return {
        kind: 'fixed' as const,
        id: f.id,
        name: f.name,
        amount: paidWith?.amount ?? f.amount,
        dueDate: dueDate(month, f.dayOfMonth),
        accountId: f.accountId,
        eventId: f.eventId,
        paid: !!paidWith,
        skipped: !paidWith && skipped.some((x) => x.fixedExpenseId === f.id && x.month === month),
        movementId: paidWith?.id ?? null,
      };
    }),
    ...accounts
      .filter((a) => a.type === 'credit_card')
      .map((a) => {
        const debt = Math.max(0, -bal.get(a.id)!);
        const paidThisMonth = inMonth
          .filter((m) => m.type === 'transfer' && m.toAccountId === a.id)
          .reduce((s, m) => s + m.amount, 0);
        return {
          kind: 'card' as const,
          id: a.id,
          name: a.name === 'Tarjeta' ? 'Resumen de tarjeta' : `Resumen de ${a.name}`,
          amount: debt > 0 ? debt : paidThisMonth,
          dueDate: dueDate(month, a.dueDay ?? 31),
          accountId: a.id,
          eventId: null,
          paid: debt === 0,
          skipped: false,
          movementId: null,
        };
      })
      .filter((p) => p.amount > 0),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendingTotal = payments.filter((p) => !p.paid && !p.skipped).reduce((s, p) => s + p.amount, 0);
  const cardDebt = payments.filter((p) => p.kind === 'card' && !p.paid).reduce((s, p) => s + p.amount, 0);

  const { person: byPerson, event: byEvent } = balances([...movements, ...planned], events);
  const unassigned = byPerson.get(null) ?? 0; // others' money with nobody assigned
  let owe = Math.max(0, -unassigned);
  let owed = Math.max(0, unassigned);
  for (const p of people) {
    const b = byPerson.get(p.id) ?? 0;
    if (b < 0) owe -= b;
    else owed += b;
  }

  const free = totalInAccounts - pendingTotal - owe;
  const pct = (n: number, of = totalInAccounts) => (of > 0 ? Math.round((Math.max(0, n) / of) * 100) : 0);
  // An overdrawn account would push the others past 100%, so shares are over positive balances.
  const positive = money.reduce((s, a) => s + Math.max(0, bal.get(a.id)!), 0);

  const eventById = new Map(events.map((e) => [e.id, e]));
  const ownSpend = (categoryId: number) =>
    inMonth
      .filter((m) => m.type === 'expense' && !m.isOthers && m.categoryId === categoryId)
      .reduce((s, m) => s + myShare(m, m.eventId == null ? undefined : eventById.get(m.eventId)), 0);
  const budgets = categories.map((c) => ({ id: c.id, name: c.name, limit: c.monthlyLimit, spent: ownSpend(c.id) }));

  // Split each account's money into what's free, set aside for pending payments and other people's.
  // What you owe (`owe`, the same number as "Debés") is spread over the accounts by where that money
  // came in: handed to you / lent to you, minus what you already paid back. A card payment is assumed
  // to come from the bank, like the Pagos screen does. Free can be negative: what you'd need to put in.
  const payFrom = money.find((a) => a.type === 'bank') ?? money[0];
  const pendingBy = new Map<number, number>();
  const rawOthers = new Map<number, number>();
  for (const p of payments.filter((p) => !p.paid && !p.skipped)) {
    const id = p.kind === 'card' ? payFrom?.id : p.accountId;
    if (id != null) pendingBy.set(id, (pendingBy.get(id) ?? 0) + p.amount);
  }
  for (const m of movements) {
    if (!m.isOthers || m.type === 'transfer') continue;
    const d = m.relation === 'passed_to_spend' || m.relation === 'lent_to_me' ? m.amount : m.relation === 'returned' ? -m.amount : 0;
    if (d) rawOthers.set(m.accountId, (rawOthers.get(m.accountId) ?? 0) + d);
  }
  const weights = new Map(money.map((a) => [a.id, Math.max(0, rawOthers.get(a.id) ?? 0)]));
  if (![...weights.values()].some((w) => w > 0)) for (const a of money) weights.set(a.id, Math.max(0, bal.get(a.id)!)); // no trail: by balance
  const weightSum = [...weights.values()].reduce((s, w) => s + w, 0);
  const othersBy = new Map(money.map((a) => [a.id, weightSum ? Math.round((owe * weights.get(a.id)!) / weightSum) : 0]));
  const split = (id: number) => {
    const balance = Math.max(0, bal.get(id)!);
    const others = Math.min(balance, Math.max(0, othersBy.get(id) ?? 0));
    const pending = pendingBy.get(id) ?? 0;
    // Negative free = what's missing in this account to cover its pending payments.
    return { free: balance - others - pending, pending, others };
  };

  const openOwing = events.filter((e) => !e.closed && (byEvent.get(e.id) ?? 0) < 0);

  return {
    month,
    free,
    totalInAccounts,
    cardDebt,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: bal.get(a.id)!,
      pct: a.type === 'credit_card' ? null : pct(bal.get(a.id)!, positive),
      split: a.type === 'credit_card' ? null : split(a.id),
    })),
    owners: { free, pending: pendingTotal, others: owe, freePct: pct(free), pendingPct: pct(pendingTotal), othersPct: pct(owe) },
    payments,
    pendingTotal,
    owe,
    owed,
    budgets,
    budgetSpent: budgets.reduce((s, b) => s + b.spent, 0),
    budgetLimit: budgets.reduce((s, b) => s + b.limit, 0),
    eventsWithOthers: { count: openOwing.length, amount: -openOwing.reduce((s, e) => s + byEvent.get(e.id)!, 0) },
  };
}

// ponytail: every read loads the whole ledger into memory. Fine for one person's money;
// switch to SQL aggregates if movements reach the hundreds of thousands.
@Injectable()
export class Ledger {
  constructor(
    @InjectRepository(Account) private accounts: Repository<Account>,
    @InjectRepository(Person) private people: Repository<Person>,
    @InjectRepository(Event) private events: Repository<Event>,
    @InjectRepository(Category) private categories: Repository<Category>,
    @InjectRepository(FixedExpense) private fixedExpenses: Repository<FixedExpense>,
    @InjectRepository(Movement) private movements: Repository<Movement>,
    @InjectRepository(SkippedPayment) private skipped: Repository<SkippedPayment>,
  ) {}

  async planned() {
    const [fixed, paid] = await Promise.all([
      this.fixedExpenses.find({ where: { eventId: Not(IsNull()) } }),
      this.movements.find({ where: { fixedExpenseId: Not(IsNull()) }, select: { fixedExpenseId: true } }),
    ]);
    return plannedExpenses(fixed, new Set(paid.map((m) => m.fixedExpenseId)));
  }

  allEvents() {
    return this.events.find({ relations: { people: true }, order: { createdAt: 'DESC' } });
  }

  allMovements() {
    return this.movements.find({ order: { date: 'DESC', id: 'DESC' } });
  }

  async summary(month: string) {
    const [accounts, people, events, categories, fixedExpenses, movements, skipped] = await Promise.all([
      this.accounts.find({ order: { id: 'ASC' } }),
      this.people.find(),
      this.allEvents(),
      this.categories.find({ order: { id: 'ASC' } }),
      this.fixedExpenses.find({ order: { dayOfMonth: 'ASC' } }),
      this.allMovements(),
      this.skipped.find({ where: { month } }),
    ]);
    return summarize({ month, accounts, people, events, categories, fixedExpenses, movements, skipped, planned: await this.planned() });
  }
}
