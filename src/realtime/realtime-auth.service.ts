import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Socket } from 'socket.io';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(socket: Socket): Promise<AuthenticatedUser | null> {
    const authorization = socket.handshake.headers.authorization;
    const token = String(
      socket.handshake.auth.token ??
        authorization?.replace(/^Bearer\s+/i, '') ??
        '',
    );
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        username: string;
        role: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== UserStatus.ACTIVE) return null;
      return { userId: user.id, username: user.username, role: user.role };
    } catch {
      return null;
    }
  }
}
