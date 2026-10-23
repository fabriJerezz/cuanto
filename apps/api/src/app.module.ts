import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccountsController,
  CategoriesController,
  EventsController,
  FixedExpensesController,
  PeopleController,
  SummaryController,
} from './crud.controllers.js';
import { AuthController, AuthGuard } from './auth.js';
import { ENTITIES } from './entities.js';
import { Ledger } from './ledger.js';
import { MovementsController } from './movements.controller.js';

@Module({
  imports: [
    // Async so DB_PATH is read after main.ts loads .env.
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'better-sqlite3',
        database: process.env.DB_PATH ?? 'cuanto.sqlite',
        entities: ENTITIES,
        // ponytail: schema sync on boot instead of migrations; add migrations before data you can't recreate.
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  controllers: [
    AuthController,
    SummaryController,
    AccountsController,
    PeopleController,
    EventsController,
    CategoriesController,
    FixedExpensesController,
    MovementsController,
  ],
  providers: [Ledger, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
