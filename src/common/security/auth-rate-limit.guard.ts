import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly rateLimits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const limit = this.config.get<number>('AUTH_RATE_LIMIT', 10);
    const windowMs = this.config.get<number>('AUTH_RATE_WINDOW_MS', 60000);
    const key = `auth:${context.getHandler().name}:${request.ip}`;
    if (!this.rateLimits.consume(key, limit, windowMs)) {
      throw new ThrottlerException('Too many authentication attempts');
    }
    return true;
  }
}
