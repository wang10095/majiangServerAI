import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ChatModule } from './chat/chat.module';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { FriendsModule } from './friends/friends.module';
import { HealthModule } from './health/health.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { MahjongModule } from './mahjong/mahjong.module';
import { RedisModule } from './redis/redis.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoomsModule } from './rooms/rooms.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_MS', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 120),
        },
      ],
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    RoomsModule,
    TeamsModule,
    ChatModule,
    MatchmakingModule,
    MahjongModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
