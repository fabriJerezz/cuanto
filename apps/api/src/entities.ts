import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const ACCOUNT_TYPES = ['cash', 'bank', 'wallet', 'credit_card'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PERSON_KINDS = ['person', 'group'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const MOVEMENT_TYPES = ['income', 'expense', 'transfer'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

// How a movement with someone else's money relates to that person.
export const INCOME_RELATIONS = ['passed_to_spend', 'returned_to_me', 'lent_to_me'] as const;
export const EXPENSE_RELATIONS = ['advanced', 'spent_theirs', 'returned'] as const;
export const RELATIONS = [...INCOME_RELATIONS, ...EXPENSE_RELATIONS] as const;
export type Relation = (typeof RELATIONS)[number];

// Amounts are whole pesos (the design never shows cents).
@Entity()
export class Account {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'varchar' }) type: AccountType;
  // Signed: a credit card starts negative (its debt).
  @Column({ type: 'integer', default: 0 }) initialBalance: number;
  // Credit cards only: day the statement is due.
  @Column({ type: 'integer', nullable: true }) dueDay: number | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity()
export class Person {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'varchar', default: 'person' }) kind: PersonKind;
  @CreateDateColumn() createdAt: Date;
}

@Entity()
export class Event {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'integer', nullable: true }) personId: number | null;
  @ManyToOne(() => Person, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'personId' })
  person: Person | null;
  @Column({ default: false }) closed: boolean;
  @CreateDateColumn() createdAt: Date;
}

@Entity()
export class Category {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'integer', default: 0 }) monthlyLimit: number;
}

@Entity()
export class FixedExpense {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'integer' }) amount: number;
  @Column({ type: 'integer' }) dayOfMonth: number;
  @Column({ type: 'integer' }) accountId: number;
  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accountId' })
  account: Account;
}

@Entity()
export class Movement {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar' }) type: MovementType;
  @Column({ type: 'integer' }) amount: number;
  @Column({ default: '' }) description: string;
  // Local date-time, 'YYYY-MM-DDTHH:mm'. A string keeps month filters a prefix match.
  @Column({ type: 'varchar' }) date: string;

  @Column({ type: 'integer' }) accountId: number;
  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accountId' })
  account: Account;

  // Transfers only.
  @Column({ type: 'integer', nullable: true }) toAccountId: number | null;
  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'toAccountId' })
  toAccount: Account | null;

  // Own income/expense only.
  @Column({ type: 'integer', nullable: true }) categoryId: number | null;
  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  // "No es mío" / "Es plata de otra persona".
  @Column({ default: false }) isOthers: boolean;

  @Column({ type: 'integer', nullable: true }) personId: number | null;
  @ManyToOne(() => Person, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'personId' })
  person: Person | null;

  @Column({ type: 'varchar', nullable: true }) relation: Relation | null;

  @Column({ type: 'integer', nullable: true }) eventId: number | null;
  @ManyToOne(() => Event, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event: Event | null;

  // Set when the movement pays a fixed expense.
  @Column({ type: 'integer', nullable: true }) fixedExpenseId: number | null;
  @ManyToOne(() => FixedExpense, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fixedExpenseId' })
  fixedExpense: FixedExpense | null;

  @CreateDateColumn() createdAt: Date;
}

export const ENTITIES = [Account, Person, Event, Category, FixedExpense, Movement];
