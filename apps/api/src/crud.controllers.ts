import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { Account, Category, Event, FixedExpense, Movement, Person } from './entities.js';
import { Ledger, accountBalances, balancesBy, monthOf, rendition } from './ledger.js';
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
    @InjectRepository(Event) private events: Repository<Event>,
    @InjectRepository(Movement) private movements: Repository<Movement>,
    private ledger: Ledger,
  ) {}

  @Get()
  async list() {
    const [people, events, movements] = await Promise.all([
      this.repo.find({ order: { name: 'ASC' } }),
      this.events.find({ order: { createdAt: 'DESC' } }),
      this.ledger.allMovements(),
    ]);
    const bal = balancesBy('personId', movements);
    return people.map((p) => {
      const last = movements.find((m) => m.personId === p.id);
      const event = events.find((e) => e.personId === p.id && !e.closed);
      return { ...p, balance: bal.get(p.id) ?? 0, lastMovementDate: last?.date ?? null, eventName: event?.name ?? null };
    });
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const person = await found(this.repo.findOneBy({ id }));
    const [movements, events] = await Promise.all([
      this.movements.find({ where: { personId: id }, relations: WITH, order: { date: 'DESC', id: 'DESC' } }),
      this.events.find({ where: { personId: id }, order: { createdAt: 'DESC' } }),
    ]);
    const balance = balancesBy('personId', movements).get(id) ?? 0;
    return { ...person, balance, ...rendition(movements), events, movements };
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
    private ledger: Ledger,
  ) {}

  @Get()
  async list() {
    const [events, movements] = await Promise.all([
      this.repo.find({ relations: { person: true }, order: { createdAt: 'DESC' } }),
      this.ledger.allMovements(),
    ]);
    const bal = balancesBy('eventId', movements);
    return events.map((e) => ({ ...e, balance: bal.get(e.id) ?? 0 }));
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const event = await found(this.repo.findOne({ where: { id }, relations: { person: true } }));
    const movements = await this.movements.find({ where: { eventId: id }, relations: WITH, order: { date: 'DESC', id: 'DESC' } });
    const balance = balancesBy('eventId', movements).get(id) ?? 0;
    return { ...event, balance, ...rendition(movements), movements };
  }

  @Post()
  create(@Body() dto: CreateEventDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEventDto) {
    return this.repo.save(Object.assign(await found(this.repo.findOneBy({ id })), defined(dto)));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return removed(this.repo.delete(id));
  }
}

@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category) private repo: Repository<Category>,
    @InjectRepository(Movement) private movements: Repository<Movement>,
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
    const movements = all.filter((m) => monthOf(m.date) === month);
    return { ...category, month, spent: movements.reduce((s, m) => s + m.amount, 0), movements };
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
  constructor(@InjectRepository(FixedExpense) private repo: Repository<FixedExpense>) {}

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
