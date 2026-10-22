import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

// Deleting an account that still has movements or fixed expenses hits a RESTRICT foreign key.
@Catch(QueryFailedError)
export class ForeignKeyFilter extends BaseExceptionFilter {
  catch(err: QueryFailedError, host: ArgumentsHost) {
    if (!/FOREIGN KEY/i.test(err.message)) return super.catch(err, host);
    host
      .switchToHttp()
      .getResponse()
      .status(409)
      .json({ statusCode: 409, message: 'Tiene movimientos o gastos fijos asociados' });
  }
}
