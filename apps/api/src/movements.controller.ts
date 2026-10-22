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
import { monthOf } from './ledger.js';

export const WITH = { account: true, toAccount: true, category: true, person: true, event: true } as const;

@Controller('movements')
export class MovementsController {
  constructor(
    @InjectRepository(Movement) private repo: Repository<Movement>,
    @InjectRepository(Person) private people: Repository<Person>,
    @InjectRepository(Event) private events: Repository<Event>,
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
        ...(filter === 'others' && { isOthers: true }),
        ...(categoryId && { categoryId: Number(categoryId) }),
      },
      relations: WITH,
      order: { date: 'DESC', id: 'DESC' },
    });
    const out = month ? rows.filter((m) => monthOf(m.date) === month) : rows;
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

    if (m.isOthers) {
      m.categoryId = null;
      const allowed: readonly string[] = m.type === 'income' ? INCOME_RELATIONS : EXPENSE_RELATIONS;
      if (m.relation && !allowed.includes(m.relation)) throw new BadRequestException('La relación no corresponde al tipo de movimiento');
      if (newPersonName?.trim()) m.personId = (await this.people.save({ name: newPersonName.trim() })).id;
      if (eventName !== undefined) m.eventId = eventName.trim() ? await this.eventId(eventName.trim(), m.personId) : null;
      if (!m.personId) m.relation = null;
      else m.relation ??= allowed[0] as Movement['relation'];
    } else if (m.type !== 'transfer') {
      Object.assign(m, { personId: null, relation: null, eventId: null });
    }

    const { id } = await this.repo.save(m);
    return this.get(id);
  }

  private async eventId(name: string, personId: number | null) {
    const open = await this.events.find({ where: { closed: false } });
    const found = open.find((e) => e.name.toLowerCase() === name.toLowerCase());
    return found ? found.id : (await this.events.save({ name, personId })).id;
  }
}
