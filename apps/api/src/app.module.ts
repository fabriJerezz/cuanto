import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccountsController,
  CategoriesController,
  EventsController,
  FixedExpensesController,
  PeopleController,
  SummaryController,
} from './crud.controllers.js';
import { ENTITIES } from './entities.js';
import { Ledger } from './ledger.js';
import { MovementsController } from './movements.controller.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? 'cuanto.sqlite',
      entities: ENTITIES,
      // ponytail: schema sync on boot instead of migrations; add migrations before data you can't recreate.
      synchronize: true,
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  controllers: [
    SummaryController,
    AccountsController,
    PeopleController,
    EventsController,
    CategoriesController,
    FixedExpensesController,
    MovementsController,
  ],
  providers: [Ledger],
})
export class AppModule {}
