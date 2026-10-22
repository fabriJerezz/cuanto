import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, Category, Event, FixedExpense, Movement, Person } from './entities.js';

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
// Any expense of their money (advancing, spending what they gave, paying back) moves it up;
// any income of their money (they gave, lent or paid back) moves it down.
export function othersDelta(m: Mv) {
  if (!m.isOthers || m.type === 'transfer') return 0;
  return m.type === 'expense' ? m.amount : -m.amount;
}

export function balancesBy(key: 'personId' | 'eventId', movements: Mv[]) {
  const out = new Map<number | null, number>();
  for (const m of movements) out.set(m[key], (out.get(m[key]) ?? 0) + othersDelta(m));
  return out;
}

// Money they handed you vs. what you already spent of it ("te pasó X, gastaste Y").
export function rendition(movements: (Mv & Pick<Movement, 'relation'>)[]) {
  let received = 0;
  let spent = 0;
  for (const m of movements) {
    if (m.relation === 'passed_to_spend' || m.relation === 'lent_to_me') received += m.amount;
    if (m.relation === 'spent_theirs') spent += m.amount;
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
}

export function summarize({ month, accounts, people, events, categories, fixedExpenses, movements }: SummaryInput) {
  const bal = accountBalances(accounts, movements);
  const inMonth = movements.filter((m) => monthOf(m.date) === month);

  const money = accounts.filter((a) => a.type !== 'credit_card');
  const totalInAccounts = money.reduce((s, a) => s + bal.get(a.id)!, 0);

  const payments = [
    ...fixedExpenses.map((f) => {
      const paidWith = inMonth.find((m) => m.fixedExpenseId === f.id);
      return {
        kind: 'fixed' as const,
        id: f.id,
        name: f.name,
        amount: paidWith?.amount ?? f.amount,
        dueDate: dueDate(month, f.dayOfMonth),
        accountId: f.accountId,
        paid: !!paidWith,
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
          paid: debt === 0,
          movementId: null,
        };
      })
      .filter((p) => p.amount > 0),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendingTotal = payments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  const cardDebt = payments.filter((p) => p.kind === 'card' && !p.paid).reduce((s, p) => s + p.amount, 0);

  const byPerson = balancesBy('personId', movements);
  let owe = Math.max(0, -(byPerson.get(null) ?? 0)); // others' money with nobody assigned
  let owed = 0;
  for (const p of people) {
    const b = byPerson.get(p.id) ?? 0;
    if (b < 0) owe -= b;
    else owed += b;
  }

  const free = totalInAccounts - pendingTotal - owe;
  const pct = (n: number, of = totalInAccounts) => (of > 0 ? Math.round((Math.max(0, n) / of) * 100) : 0);
  // An overdrawn account would push the others past 100%, so shares are over positive balances.
  const positive = money.reduce((s, a) => s + Math.max(0, bal.get(a.id)!), 0);

  const ownSpend = (categoryId: number) =>
    inMonth
      .filter((m) => m.type === 'expense' && !m.isOthers && m.categoryId === categoryId)
      .reduce((s, m) => s + m.amount, 0);
  const budgets = categories.map((c) => ({ id: c.id, name: c.name, limit: c.monthlyLimit, spent: ownSpend(c.id) }));

  const byEvent = balancesBy('eventId', movements);
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
  ) {}

  allMovements() {
    return this.movements.find({ order: { date: 'DESC', id: 'DESC' } });
  }

  async summary(month: string) {
    const [accounts, people, events, categories, fixedExpenses, movements] = await Promise.all([
      this.accounts.find({ order: { id: 'ASC' } }),
      this.people.find(),
      this.events.find(),
      this.categories.find({ order: { id: 'ASC' } }),
      this.fixedExpenses.find({ order: { dayOfMonth: 'ASC' } }),
      this.allMovements(),
    ]);
    return summarize({ month, accounts, people, events, categories, fixedExpenses, movements });
  }
}
