import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configure } from '../src/main.js';

describe('ledger', () => {
  let app: INestApplication;
  // An agent keeps the session cookie between requests.
  let agent: ReturnType<typeof request.agent>;
  const api = () => agent;
  const post = async (url: string, body: object) => (await api().post(`/api${url}`).send(body).expect(201)).body;
  const summary = async () => (await api().get('/api/summary?month=2026-10').expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configure(app);
    await app.init();
    agent = request.agent(app.getHttpServer());
  });
  afterAll(() => app.close());

  it('asks for the PIN', async () => {
    await agent.get('/api/summary').expect(401);
    await agent.post('/api/auth/login').send({ pin: '0000' }).expect(401);
    const res = await agent.post('/api/auth/login').send({ pin: '4321' }).expect(204);
    expect(res.headers['set-cookie'][0]).toMatch(/cuanto_session=.+HttpOnly/);
    await agent.get('/api/auth/me').expect(204);
  });

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
    // Lucas hands over money for an event: the new event is his to spend, without you.
    const lucasIn = await post('/movements', {
      type: 'income', amount: 100000, date: d, accountId: bank.id, isOthers: true,
      newPersonName: 'Lucas', relation: 'passed_to_spend', eventName: 'Entradas recital',
    });
    // Your expense on that event comes out of his money.
    await post('/movements', { type: 'expense', amount: 30000, date: d, accountId: bank.id, eventName: 'entradas recital' });
    // A loan to Mica.
    const mica = await post('/movements', { type: 'expense', amount: 25000, date: d, accountId: cash.id, isOthers: true, newPersonName: 'Mica' });
    expect(mica.relation).toBe('advanced');
    await post('/movements', { type: 'expense', amount: 38400, date: d, accountId: card.id, categoryId: food.id });
    // A shared barbecue: you pay, Nico joins later, you split it in two.
    const asado = await post('/movements', { type: 'expense', amount: 60000, date: d, accountId: cash.id, categoryId: food.id, eventName: 'Asado' });
    const nico = await post('/people', { name: 'Nico' });
    await api().patch(`/api/events/${asado.eventId}`).send({ personIds: [nico.id] }).expect(200);
    await post('/movements', { type: 'transfer', amount: 30000, date: d, accountId: bank.id, toAccountId: cash.id });
    await post('/movements', { type: 'expense', amount: 280000, date: '2026-10-05T09:00', accountId: bank.id, fixedExpenseId: rent.id });

    let s = await summary();
    expect(s.totalInAccounts).toBe(30000 + 400000 + 120000);
    expect(s.pendingTotal).toBe(24500 + 31200 + 12300 + 248400);
    expect(s.owe).toBe(70000);
    expect(s.owed).toBe(25000 + 30000);
    expect(s.free).toBe(550000 - 316400 - 70000);
    expect(s.payments.find((p: { name: string }) => p.name === 'Alquiler').paid).toBe(true);
    // Only your half of the barbecue counts against the budget.
    expect(s.budgets[0]).toMatchObject({ name: 'Comida', spent: 38400 + 30000, limit: 200000 });
    expect(s.eventsWithOthers).toEqual({ count: 1, amount: 70000 });

    const lucas = (await api().get(`/api/people/${lucasIn.personId}`).expect(200)).body;
    expect(lucas).toMatchObject({ balance: -70000, received: 100000, spent: 30000 });
    expect(lucas.movements).toHaveLength(2);
    expect(lucas.events[0]).toMatchObject({ id: lucasIn.eventId, includeMe: false });

    const nicoDetail = (await api().get(`/api/people/${nico.id}`).expect(200)).body;
    expect(nicoDetail.balance).toBe(30000);
    expect(nicoDetail.movements[0].share).toBe(30000);

    const ev = (await api().get(`/api/events/${asado.eventId}`).expect(200)).body;
    expect(ev).toMatchObject({ includeMe: true, balance: 30000, people: [{ name: 'Nico', balance: 30000 }] });
    expect(ev.movements[0].myShare).toBe(30000);

    // Nico pays his part of the asado back once; a second time is rejected.
    const back = { type: 'income', date: d, accountId: cash.id, isOthers: true, personId: nico.id, relation: 'returned_to_me', eventId: asado.eventId };
    await api().post('/api/movements').send({ ...back, amount: 40000 }).expect(400);
    await post('/movements', { ...back, amount: 30000 });
    await api().post('/api/movements').send({ ...back, amount: 1000 }).expect(400);

    // Paying the card statement is a transfer: debt goes down, free money stays.
    await post('/movements', { type: 'transfer', amount: 248400, date: '2026-10-22T12:00', accountId: bank.id, toAccountId: card.id });
    s = await summary();
    expect(s.payments.find((p: { kind: string }) => p.kind === 'card')).toMatchObject({ paid: true, amount: 248400 });
    expect(s.free).toBe(193600); // + the 30000 Nico paid back
  });

  it('leaves a fixed expense out of one month', async () => {
    const before = await summary();
    const internet = before.payments.find((p: { name: string }) => p.name === 'Internet');
    await api().put(`/api/fixed-expenses/${internet.id}/skip/2026-10`).expect(200);
    const after = await summary();
    expect(after.payments.find((p: { name: string }) => p.name === 'Internet')).toMatchObject({ skipped: true });
    expect(after.pendingTotal).toBe(before.pendingTotal - internet.amount);
    await api().delete(`/api/fixed-expenses/${internet.id}/skip/2026-10`).expect(200);
    expect((await summary()).pendingTotal).toBe(before.pendingTotal);
  });

  it('keeps one-off payments to their month and pays events from them', async () => {
    const [bank] = (await api().get('/api/accounts').expect(200)).body;
    const gift = await post('/fixed-expenses', { name: 'Regalo', amount: 5000, dayOfMonth: 10, accountId: bank.id, month: '2026-10' });
    const names = async (month: string) =>
      (await api().get(`/api/summary?month=${month}`).expect(200)).body.payments.map((p: { name: string }) => p.name);
    expect(await names('2026-10')).toContain('Regalo');
    expect(await names('2026-11')).not.toContain('Regalo');
    await api().delete(`/api/fixed-expenses/${gift.id}`).expect(200);

    // An event planned with an amount and account is a payment of the current month; nothing is deducted yet.
    const before = await summary();
    const ev = await post('/events', { name: 'Cumple', amount: 20000, accountId: bank.id });
    const after = await api().get('/api/summary').expect(200);
    const pay = after.body.payments.find((p: { eventId: number }) => p.eventId === ev.id);
    expect(pay).toMatchObject({ name: 'Cumple', amount: 20000, paid: false });
    expect(after.body.accounts.find((a: { id: number }) => a.id === bank.id).balance).toBe(before.accounts.find((a: { id: number }) => a.id === bank.id).balance);
    expect((await api().get(`/api/events/${ev.id}`).expect(200)).body.payment).toMatchObject({ amount: 20000 });
    await api().patch(`/api/events/${ev.id}`).send({ amount: 25000 }).expect(200);
    expect((await api().get(`/api/events/${ev.id}`).expect(200)).body.payment.amount).toBe(25000);
  });

  it('shows what people owe for a planned event before it is paid', async () => {
    const [bank] = (await api().get('/api/accounts').expect(200)).body;
    const ana = await post('/people', { name: 'Ana' });
    const ev = await post('/events', { name: 'Despedida', amount: 20000, accountId: bank.id, personIds: [ana.id], includeMe: true });
    const owes = async () => (await api().get(`/api/events/${ev.id}`).expect(200)).body.people[0].balance;
    expect(await owes()).toBe(10000);
    expect((await api().get(`/api/people/${ana.id}`).expect(200)).body.balance).toBe(10000);

    // Paying the planned payment swaps the virtual expense for the real one: no double counting.
    const pay = (await summary()).payments.find((p: { eventId: number }) => p.eventId === ev.id);
    await post('/movements', { type: 'expense', amount: 20000, date: '2026-10-22T12:00', accountId: bank.id, fixedExpenseId: pay.id, eventId: ev.id });
    expect(await owes()).toBe(10000);
    // She can pay her part back once.
    const back = { type: 'income', amount: 10000, date: '2026-10-22T12:00', accountId: bank.id, isOthers: true, personId: ana.id, relation: 'returned_to_me', eventId: ev.id };
    await post('/movements', back);
    expect(await owes()).toBe(0);
    await api().post('/api/movements').send(back).expect(400);
  });

  it('splits each account into free, pending and others', async () => {
    const { accounts } = await summary();
    for (const a of accounts.filter((a: { split: unknown }) => a.split)) {
      const { free, pending, others } = a.split;
      expect(free + pending + others).toBe(Math.max(0, a.balance));
      expect(Math.min(pending, others)).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects inconsistent movements and deleting used accounts', async () => {
    const [bank] = (await api().get('/api/accounts').expect(200)).body;
    const base = { amount: 1000, date: '2026-10-22T12:00', accountId: bank.id };
    await api().post('/api/movements').send({ ...base, type: 'transfer', toAccountId: bank.id }).expect(400);
    await api().post('/api/movements').send({ ...base, type: 'income', isOthers: true, newPersonName: 'X', relation: 'advanced' }).expect(400);
    await api().post('/api/movements').send({ ...base, type: 'expense', isOthers: true, relation: 'spent_theirs' }).expect(400);
    expect((await api().get('/api/people').expect(200)).body.some((p: { name: string }) => p.name === 'X')).toBe(false);
    await api().post('/api/movements').send({ ...base, type: 'income', bogus: 1 }).expect(400);
    await api().delete(`/api/accounts/${bank.id}`).expect(409);
  });
});
