import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  CreateAccountDto,
  CreateCategoryDto,
  CreateEventDto,
  CreateFixedExpenseDto,
  CreatePersonDto,
  UpdateAccountDto,
  UpdateCategoryDto,
  UpdateEventDto,
  UpdateFixedExpenseDto,
  UpdatePersonDto,
  defined,
} from './dto.js';
import { Account, Category, Event, FixedExpense, Movement, Person, SkippedPayment } from './entities.js';
import { Ledger, accountBalances, balances, eventShares, monthOf, myShare, rendition } from './ledger.js';
import { WITH } from './movements.controller.js';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

async function found<T>(p: Promise<T | null>) {
  const v = await p;
  if (!v) throw new NotFoundException();
  return v;
}

async function removed(p: Promise<{ affected?: number | null }>) {
  if (!(await p).affected) throw new NotFoundException();
}

@Controller('summary')
export class SummaryController {
  constructor(private ledger: Ledger) {}

  @Get()
  get(@Query('month') month = currentMonth()) {
    return this.ledger.summary(month);
  }
}

@Controller('accounts')
export class AccountsController {
  constructor(
    @InjectRepository(Account) private repo: Repository<Account>,
    private ledger: Ledger,
  ) {}

  @Get()
  async list() {
    const [accounts, movements] = await Promise.all([this.repo.find({ order: { id: 'ASC' } }), this.ledger.allMovements()]);
    const bal = accountBalances(accounts, movements);
    return accounts.map((a) => ({ ...a, balance: bal.get(a.id)! }));
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.repo.save(this.withSign(this.repo.create(), dto));
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto) {
    return this.repo.save(this.withSign(await found(this.repo.findOneBy({ id })), dto));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return removed(this.repo.delete(id));
  }

  // The form takes a card's debt as a positive number; it is stored as a negative balance.
  private withSign(a: Account, dto: UpdateAccountDto) {
    Object.assign(a, defined(dto));
    a.initialBalance ??= 0;
    if (a.type === 'credit_card') a.initialBalance = -Math.abs(a.initialBalance);
    else a.dueDay = null;
    return a;
  }
}

@Controller('people')
export class PeopleController {
  constructor(
    @InjectRepository(Person) private repo: Repository<Person>,
    @InjectRepository(Movement) private movements: Repository<Movement>,
    private ledger: Ledger,
  ) {}

  @Get()
  async list() {
    const [people, events, movements] = await Promise.all([
      this.repo.find({ order: { name: 'ASC' } }),
      this.ledger.allEvents(),
      this.ledger.allMovements(),
    ]);
    const planned = await this.ledger.planned();
    const bal = balances([...movements, ...planned], events).person;
    // What each person still owes per open event (the part they haven't paid back).
    const debts = new Map<number, { eventId: number; eventName: string; amount: number }[]>();
    for (const e of events.filter((e) => !e.closed)) {
      const owed = balances([...movements, ...planned].filter((m) => m.eventId === e.id), [e]).person;
      for (const p of e.people) {
        const amount = owed.get(p.id) ?? 0;
        if (amount > 0) debts.set(p.id, [...(debts.get(p.id) ?? []), { eventId: e.id, eventName: e.name, amount }]);
      }
    }
    return people.map((p) => {
      const mine = events.filter((e) => e.people.some((x) => x.id === p.id));
      const last = movements.find((m) => m.personId === p.id || mine.some((e) => e.id === m.eventId));
      const event = mine.find((e) => !e.closed);
      return { ...p, debts: debts.get(p.id) ?? [], balance: bal.get(p.id) ?? 0, lastMovementDate: last?.date ?? null, eventName: event?.name ?? null };
    });
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const person = await found(this.repo.findOneBy({ id }));
    const [events, all] = await Promise.all([
      this.ledger.allEvents(),
      this.movements.find({ relations: WITH, order: { date: 'DESC', id: 'DESC' } }),
    ]);
    const byId = new Map(events.map((e) => [e.id, e]));
    const shareOf = (m: Movement) => (m.eventId == null ? 0 : (eventShares(m, byId.get(m.eventId)).get(id) ?? 0));
    const movements = all
      .filter((m) => m.personId === id || shareOf(m) > 0)
      .map((m) => ({ ...m, share: m.personId === id ? null : shareOf(m) }));
    const { event: byEvent, person: byPerson } = balances([...all, ...(await this.ledger.planned())], events);
    return {
      ...person,
      balance: byPerson.get(id) ?? 0,
      ...rendition(movements, shareOf),
      events: events.filter((e) => e.people.some((p) => p.id === id)).map((e) => ({ ...e, balance: byEvent.get(e.id) ?? 0 })),
      movements,
    };
  }

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePersonDto) {
    return this.repo.save(Object.assign(await found(this.repo.findOneBy({ id })), defined(dto)));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return removed(this.repo.delete(id));
  }
}

@Controller('events')
export class EventsController {
  constructor(
    @InjectRepository(Event) private repo: Repository<Event>,
    @InjectRepository(Movement) private movements: Repository<Movement>,
    @InjectRepository(FixedExpense) private payments: Repository<FixedExpense>,
    private ledger: Ledger,
  ) {}

  // The planned payment of an event (its one-off fixed expense), if it has one.
  private async paymentOf(eventId: number) {
    const f = await this.payments.findOneBy({ eventId });
    return f ? { amount: f.amount, accountId: f.accountId, dayOfMonth: f.dayOfMonth, month: f.month } : null;
  }

  @Get()
  async list() {
    const [events, movements] = await Promise.all([this.ledger.allEvents(), this.ledger.allMovements()]);
    const bal = balances([...movements, ...(await this.ledger.planned())], events).event;
    const planned = new Map((await this.payments.find({ where: { eventId: Not(IsNull()) } })).map((f) => [f.eventId, f]));
    return events.map((e) => {
      const f = planned.get(e.id);
      const payment = f ? { amount: f.amount, accountId: f.accountId, dayOfMonth: f.dayOfMonth, month: f.month } : null;
      return { ...e, balance: bal.get(e.id) ?? 0, payment };
    });
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const event = await found(this.repo.findOne({ where: { id }, relations: { people: true } }));
    const movements = await this.movements.find({ where: { eventId: id }, relations: WITH, order: { date: 'DESC', id: 'DESC' } });
    const planned = (await this.ledger.planned()).filter((m) => m.eventId === id);
    const { person, event: byEvent } = balances([...movements, ...planned], [event]);
    const shareOf = (m: Movement) => [...eventShares(m, event).values()].reduce((s, n) => s + n, 0);
    return {
      ...event,
      // Each person's balance within this event only.
      people: event.people.map((p) => ({ ...p, balance: person.get(p.id) ?? 0 })),
      balance: byEvent.get(id) ?? 0,
      payment: await this.paymentOf(id),
      ...rendition(movements, shareOf),
      movements: movements.map((m) => ({ ...m, myShare: m.type === 'expense' && !m.isOthers ? myShare(m, event) : null })),
    };
  }

  @Post()
  async create(@Body() dto: CreateEventDto) {
    const event = await this.repo.save(this.withPeople(this.repo.create(), dto));
    await this.plan(event, dto);
    return event;
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEventDto) {
    const event = await this.repo.save(this.withPeople(await found(this.repo.findOne({ where: { id }, relations: { people: true } })), dto));
    await this.plan(event, dto);
    return event;
  }

  // Creates or updates the event's payment for this month. Nothing is deducted until it's ticked.
  private async plan(event: Event, { amount, accountId, dayOfMonth }: UpdateEventDto) {
    const current = await this.payments.findOneBy({ eventId: event.id });
    if (current) {
      await this.payments.save(Object.assign(current, { name: event.name }, defined({ amount, accountId, dayOfMonth })));
    } else if (amount && accountId) {
      await this.payments.save(
        this.payments.create({ name: event.name, amount, accountId, dayOfMonth: dayOfMonth ?? new Date().getDate(), month: currentMonth(), eventId: event.id }),
      );
    }
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return removed(this.repo.delete(id));
  }

  private withPeople(e: Event, { personIds, amount, accountId, dayOfMonth, ...dto }: UpdateEventDto) {
    Object.assign(e, defined(dto));
    if (personIds) e.people = personIds.map((id) => ({ id }) as Person);
    e.people ??= [];
    return e;
  }
}

@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category) private repo: Repository<Category>,
    @InjectRepository(Movement) private movements: Repository<Movement>,
    private ledger: Ledger,
  ) {}

  @Get()
  list() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number, @Query('month') month = currentMonth()) {
    const category = await found(this.repo.findOneBy({ id }));
    const all = await this.movements.find({
      where: { categoryId: id, type: 'expense', isOthers: false },
      relations: WITH,
      order: { date: 'DESC', id: 'DESC' },
    });
    const events = new Map((await this.ledger.allEvents()).map((e) => [e.id, e]));
    // A shared event expense only counts your part.
    const movements = all
      .filter((m) => monthOf(m.date) === month)
      .map((m) => ({ ...m, myShare: m.eventId == null ? m.amount : myShare(m, events.get(m.eventId)) }));
    return { ...category, month, spent: movements.reduce((s, m) => s + m.myShare, 0), movements };
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.repo.save(Object.assign(await found(this.repo.findOneBy({ id })), defined(dto)));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return removed(this.repo.delete(id));
  }
}

@Controller('fixed-expenses')
export class FixedExpensesController {
  constructor(
    @InjectRepository(FixedExpense) private repo: Repository<FixedExpense>,
    @InjectRepository(SkippedPayment) private skipped: Repository<SkippedPayment>,
  ) {}

  // "Este mes no": hide it and leave it out of what's pending for that month.
  @Put(':id/skip/:month')
  async skip(@Param('id', ParseIntPipe) id: number, @Param('month') month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Mes inválido');
    await found(this.repo.findOneBy({ id }));
    await this.skipped.save({ fixedExpenseId: id, month });
  }

  @Delete(':id/skip/:month')
  async unskip(@Param('id', ParseIntPipe) id: number, @Param('month') month: string) {
    await this.skipped.delete({ fixedExpenseId: id, month });
  }

  @Get()
  list() {
    return this.repo.find({ relations: { account: true }, order: { dayOfMonth: 'ASC' } });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return found(this.repo.findOne({ where: { id }, relations: { account: true } }));
  }

  @Post()
  create(@Body() dto: CreateFixedExpenseDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFixedExpenseDto) {
    return this.repo.save(Object.assign(await found(this.repo.findOneBy({ id })), defined(dto)));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return removed(this.repo.delete(id));
  }
}
