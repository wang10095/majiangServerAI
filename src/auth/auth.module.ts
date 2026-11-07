import { Module } from '@nestjs/common';
import { AuthRateLimitGuard } from '../common/security/auth-rate-limit.guard';
import { RateLimitService } from '../common/security/rate-limit.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthProtobufController } from './auth-protobuf.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, AuthProtobufController],
  providers: [AuthService, JwtStrategy, AuthRateLimitGuard, RateLimitService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
