import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, MaxLength } from 'class-validator';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { Session } from './entities.js';

// Single user: the PIN is the only credential. Change it with LOGIN_PIN (apps/api/.env).
const pin = () => process.env.LOGIN_PIN ?? '0000';
const sha256 = (s: string) => createHash('sha256').update(s).digest();
const COOKIE = 'cuanto_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

const PUBLIC = 'public';
const Public = () => SetMetadata(PUBLIC, true);

function readCookie(req: Request) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Sessions remember which PIN opened them, so changing LOGIN_PIN logs everyone out.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Session) private sessions: Repository<Session>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const token = readCookie(ctx.switchToHttp().getRequest());
    const session = token ? await this.sessions.findOneBy({ token }) : null;
    if (!session || session.pinHash !== sha256(pin()).toString('hex')) throw new UnauthorizedException('Ingresá tu PIN');
    return true;
  }
}

class LoginDto {
  @IsString() @MaxLength(32) pin: string;
}

// ponytail: one in-memory failure window for the whole app (there is one user). Resets on restart.
const failures: number[] = [];
const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;

@Controller('auth')
export class AuthController {
  constructor(@InjectRepository(Session) private sessions: Repository<Session>) {}

  @Public()
  @Post('login')
  @HttpCode(204)
  async login(@Body() { pin: given }: LoginDto, @Res({ passthrough: true }) res: Response) {
    const now = Date.now();
    while (failures.length && failures[0] < now - WINDOW_MS) failures.shift();
    if (failures.length >= MAX_FAILURES) throw new HttpException('Demasiados intentos. Probá de nuevo en unos minutos.', 429);
    if (!timingSafeEqual(sha256(given), sha256(pin()))) {
      failures.push(now);
      throw new UnauthorizedException('PIN incorrecto');
    }
    const token = randomBytes(32).toString('hex');
    await this.sessions.save({ token, pinHash: sha256(pin()).toString('hex') });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MAX_AGE_S * 1000,
      path: '/',
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req);
    if (token) await this.sessions.delete({ token });
    res.clearCookie(COOKIE, { path: '/' });
  }

  // Behind the guard: 204 means the session is valid.
  @Get('me')
  @HttpCode(204)
  me() {}
}
