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
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovementDto, UpdateMovementDto, defined } from './dto.js';
import { EXPENSE_RELATIONS, Event, INCOME_RELATIONS, Movement, Person } from './entities.js';
import { Ledger, balances, monthOf } from './ledger.js';

export const WITH = { account: true, toAccount: true, category: true, person: true, event: true } as const;

@Controller('movements')
export class MovementsController {
  constructor(
    @InjectRepository(Movement) private repo: Repository<Movement>,
    @InjectRepository(Person) private people: Repository<Person>,
    @InjectRepository(Event) private events: Repository<Event>,
    private ledger: Ledger,
  ) {}

  @Get()
  async list(
    @Query('filter') filter?: 'mine' | 'others',
    @Query('month') month?: string,
    @Query('categoryId') categoryId?: string,
    @Query('limit') limit?: string,
  ) {
    const rows = await this.repo.find({
      where: {
        ...(filter === 'mine' && { isOthers: false }),
        ...(categoryId && { categoryId: Number(categoryId) }),
      },
      relations: WITH,
      order: { date: 'DESC', id: 'DESC' },
    });
    // "De otros": someone else's money, or an expense shared through an event.
    const out = rows.filter(
      (m) => (!month || monthOf(m.date) === month) && (filter !== 'others' || m.isOthers || (m.type === 'expense' && m.eventId != null)),
    );
    return limit ? out.slice(0, Number(limit)) : out;
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const m = await this.repo.findOne({ where: { id }, relations: WITH });
    if (!m) throw new NotFoundException();
    return m;
  }

  @Post()
  async create(@Body() dto: CreateMovementDto) {
    return this.save(this.repo.create(), dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMovementDto) {
    const m = await this.repo.findOneBy({ id });
    if (!m) throw new NotFoundException();
    return this.save(m, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const { affected } = await this.repo.delete(id);
    if (!affected) throw new NotFoundException();
  }

  private async save(m: Movement, dto: UpdateMovementDto) {
    const { newPersonName, eventName, ...fields } = dto;
    Object.assign(m, defined(fields));
    m.description = (m.description ?? '').trim();
    m.isOthers ??= false;

    if (m.type === 'transfer') {
      if (!m.toAccountId || m.toAccountId === m.accountId)
        throw new BadRequestException('Una transferencia necesita una cuenta destino distinta');
      Object.assign(m, { categoryId: null, isOthers: false, personId: null, relation: null, eventId: null });
    } else {
      m.toAccountId = null;
    }

    const named = async () => {
      if (eventName !== undefined) m.eventId = eventName.trim() ? await this.eventId(eventName.trim(), m) : null;
    };
    if (m.isOthers) {
      m.categoryId = null;
      const allowed: readonly string[] = m.type === 'income' ? INCOME_RELATIONS : EXPENSE_RELATIONS;
      if (m.relation && !allowed.includes(m.relation)) throw new BadRequestException('La relación no corresponde al tipo de movimiento');
      m.relation ??= allowed[0] as Movement['relation'];
      if (newPersonName?.trim()) m.personId = (await this.people.save({ name: newPersonName.trim() })).id;
      // Money handed to you can belong to an event; a loan you give cannot.
      if (m.type === 'income') await named();
      else m.eventId = null;
    } else if (m.type !== 'transfer') {
      Object.assign(m, { personId: null, relation: null });
      // Your own expense can be shared through an event; your own income cannot.
      if (m.type === 'expense') await named();
      else m.eventId = null;
    }

    await this.checkReturn(m);
    const { id } = await this.repo.save(m);
    return this.get(id);
  }

  // Finds an open event by name (case-insensitive) or creates it. A new event from money someone
  // handed you is theirs to spend (you don't take part); one from your own expense includes you.
  private async eventId(name: string, m: Movement) {
    const open = await this.events.find({ where: { closed: false }, relations: { people: true } });
    const event =
      open.find((e) => e.name.toLowerCase() === name.toLowerCase()) ??
      this.events.create({ name, includeMe: m.type === 'expense', people: [] });
    if (m.personId && !event.people.some((p) => p.id === m.personId)) event.people.push({ id: m.personId } as Person);
    return (await this.events.save(event)).id;
  }

  // Someone paying back their part of an event can only do it once: the rest they still owe
  // there (their balance in the event without this movement) is the ceiling.
  private async checkReturn(m: Movement) {
    if (!m.isOthers || m.type !== 'income' || m.relation !== 'returned_to_me' || m.eventId == null || m.personId == null) return;
    const event = await this.events.findOne({ where: { id: m.eventId }, relations: { people: true } });
    const others = (await this.repo.find({ where: { eventId: m.eventId } })).filter((x) => x.id !== m.id);
    const planned = (await this.ledger.planned()).filter((x) => x.eventId === m.eventId);
    const pending = balances([...others, ...planned], event ? [event] : []).person.get(m.personId) ?? 0;
    if (pending <= 0) throw new BadRequestException('Esa persona ya devolvió su parte de este evento');
    if (m.amount > pending) throw new BadRequestException(`Esa persona solo debe ${pending} en este evento`);
  }
}
