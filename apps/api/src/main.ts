import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ForeignKeyFilter } from './foreign-key.filter.js';

export function configure(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ForeignKeyFilter(app.get(HttpAdapterHost).httpAdapter));
}

if (process.env.NODE_ENV !== 'test') {
  // Optional apps/api/.env (LOGIN_PIN, DB_PATH, PORT).
  try {
    process.loadEnvFile();
  } catch {}
  const app = await NestFactory.create(AppModule);
  configure(app);
  await app.listen(process.env.PORT ?? 3000);
}
