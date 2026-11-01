import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RateLimitService } from '../common/security/rate-limit.service';

@Injectable()
export class SocketRateLimitGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly rateLimits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const socket = context.switchToWs().getClient<Socket>();
    const user = (socket.data as { user?: AuthenticatedUser }).user;
    const tracker = user?.userId ?? socket.handshake.address;
    const event = context.getHandler().name;
    const isGameInput = event === 'input';
    const limit = this.config.get<number>(
      isGameInput ? 'SOCKET_GAME_INPUT_RATE_LIMIT' : 'SOCKET_EVENT_RATE_LIMIT',
      isGameInput ? 30 : 20,
    );
    const windowMs = this.config.get<number>('SOCKET_RATE_WINDOW_MS', 1000);
    const key = `socket:${socket.nsp.name}:${event}:${tracker}`;
    if (!this.rateLimits.consume(key, limit, windowMs)) {
      throw new WsException({
        code: 'RATE_LIMITED',
        message: 'Too many realtime events',
      });
    }
    return true;
  }
}
