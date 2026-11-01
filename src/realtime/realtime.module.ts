import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { RateLimitService } from '../common/security/rate-limit.service';
import { GameGateway } from './game.gateway';
import { PlatformGateway } from './platform.gateway';
import { RealtimeAuthService } from './realtime-auth.service';
import { SocketConnectionLimitService } from './socket-connection-limit.service';
import { SocketExceptionFilter } from './socket-exception.filter';
import { SocketRateLimitGuard } from './socket-rate-limit.guard';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [
    RealtimeAuthService,
    RateLimitService,
    SocketRateLimitGuard,
    SocketConnectionLimitService,
    SocketExceptionFilter,
    PlatformGateway,
    GameGateway,
  ],
})
export class RealtimeModule {}
