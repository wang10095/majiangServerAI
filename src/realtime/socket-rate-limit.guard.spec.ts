import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { RateLimitService } from '../common/security/rate-limit.service';
import { SocketRateLimitGuard } from './socket-rate-limit.guard';

describe('SocketRateLimitGuard', () => {
  it('limits repeated events for the same authenticated user', () => {
    const config = {
      get: (_key: string, fallback: number) => (fallback === 30 ? 2 : fallback),
    } as ConfigService;
    const guard = new SocketRateLimitGuard(config, new RateLimitService());
    const socket = {
      data: { user: { userId: 'user-1' } },
      handshake: { address: '127.0.0.1' },
      nsp: { name: '/game' },
    };
    const context = {
      switchToWs: () => ({ getClient: () => socket }),
      getHandler: () => ({ name: 'input' }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(WsException);
  });
});
