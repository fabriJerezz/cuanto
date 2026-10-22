import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configure } from '../src/main.js';

describe('ledger', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const post = async (url: string, body: object) => (await api().post(`/api${url}`).send(body).expect(201)).body;
  const summary = async () => (await api().get('/api/summary?month=2026-10').expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configure(app);
    await app.init();
  });
  afterAll(() => app.close());

  it('computes free money, debts and pending payments', async () => {
    const cash = await post('/accounts', { name: 'Efectivo', type: 'cash', initialBalance: 85000 });
    const bank = await post('/accounts', { name: 'Banco', type: 'bank', initialBalance: 640000 });
    await post('/accounts', { name: 'Billetera', type: 'wallet', initialBalance: 120000 });
    const card = await post('/accounts', { name: 'Tarjeta', type: 'credit_card', initialBalance: 210000, dueDay: 30 });
    expect(card.initialBalance).toBe(-210000);

    const rent = await post('/fixed-expenses', { name: 'Alquiler', amount: 280000, dayOfMonth: 5, accountId: bank.id });
    await post('/fixed-expenses', { name: 'Internet', amount: 24500, dayOfMonth: 25, accountId: bank.id });
    await post('/fixed-expenses', { name: 'Luz', amount: 31200, dayOfMonth: 28, accountId: bank.id });
    await post('/fixed-expenses', { name: 'Suscripciones', amount: 12300, dayOfMonth: 31, accountId: card.id });
    const food = await post('/categories', { name: 'Comida', monthlyLimit: 200000 });

    const d = '2026-10-12T10:00';
    const lucasIn = await post('/movements', {
      type: 'income', amount: 100000, date: d, accountId: bank.id, isOthers: true,
      newPersonName: 'Lucas', relation: 'passed_to_spend', eventName: 'Entradas recital',
    });
    await post('/movements', {
      type: 'expense', amount: 30000, date: d, accountId: bank.id, isOthers: true,
      personId: lucasIn.personId, relation: 'spent_theirs', eventName: 'entradas recital',
    });
    await post('/movements', { type: 'expense', amount: 25000, date: d, accountId: cash.id, isOthers: true, newPersonName: 'Mica', relation: 'advanced' });
    await post('/movements', { type: 'expense', amount: 38400, date: d, accountId: card.id, categoryId: food.id });
    await post('/movements', { type: 'transfer', amount: 30000, date: d, accountId: bank.id, toAccountId: cash.id });
    await post('/movements', { type: 'expense', amount: 280000, date: '2026-10-05T09:00', accountId: bank.id, fixedExpenseId: rent.id });

    let s = await summary();
    expect(s.totalInAccounts).toBe(610000);
    expect(s.pendingTotal).toBe(24500 + 31200 + 12300 + 248400);
    expect(s.owe).toBe(70000);
    expect(s.owed).toBe(25000);
    expect(s.free).toBe(223600);
    expect(s.payments.find((p: { name: string }) => p.name === 'Alquiler').paid).toBe(true);
    expect(s.budgets[0]).toMatchObject({ name: 'Comida', spent: 38400, limit: 200000 });
    expect(s.eventsWithOthers).toEqual({ count: 1, amount: 70000 });

    const lucas = (await api().get(`/api/people/${lucasIn.personId}`).expect(200)).body;
    expect(lucas).toMatchObject({ balance: -70000, received: 100000, spent: 30000 });
    expect(lucas.movements).toHaveLength(2);
    expect(lucas.movements[0].eventId).toBe(lucasIn.eventId); // matched the open event case-insensitively

    // Paying the card statement is a transfer: debt goes down, free money stays.
    await post('/movements', { type: 'transfer', amount: 248400, date: '2026-10-22T12:00', accountId: bank.id, toAccountId: card.id });
    s = await summary();
    expect(s.payments.find((p: { kind: string }) => p.kind === 'card')).toMatchObject({ paid: true, amount: 248400 });
    expect(s.free).toBe(223600);
  });

  it('rejects inconsistent movements and deleting used accounts', async () => {
    const [bank] = (await api().get('/api/accounts').expect(200)).body;
    const base = { amount: 1000, date: '2026-10-22T12:00', accountId: bank.id };
    await api().post('/api/movements').send({ ...base, type: 'transfer', toAccountId: bank.id }).expect(400);
    await api().post('/api/movements').send({ ...base, type: 'income', isOthers: true, newPersonName: 'X', relation: 'advanced' }).expect(400);
    await api().post('/api/movements').send({ ...base, type: 'income', bogus: 1 }).expect(400);
    await api().delete(`/api/accounts/${bank.id}`).expect(409);
  });
});
