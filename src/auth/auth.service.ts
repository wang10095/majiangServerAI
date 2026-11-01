import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { publicUserSelect } from '../users/users.service';
import { GuestLoginDto } from './dto/guest-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (existing) throw new ConflictException('Username already exists');
    const user = await this.prisma.user.create({
      data: {
        username: dto.username.toLowerCase(),
        passwordHash: await hash(dto.password, 12),
        displayName: dto.displayName,
      },
    });
    return this.issueTokenPair(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (
      !user?.passwordHash ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.issueTokenPair(user);
  }

  async guestLogin(dto: GuestLoginDto) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const user = await this.prisma.user.create({
      data: {
        username: `guest_${suffix}`,
        displayName: dto.displayName ?? `游客${suffix.slice(0, 4)}`,
      },
    });
    return this.issueTokenPair(user);
  }

  async refresh(rawToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      stored.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }
    const tokenPair = await this.signTokenPair(stored.user);
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: stored.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1)
        throw new UnauthorizedException('Refresh token expired or revoked');
      await tx.refreshToken.create({
        data: {
          tokenHash: this.hashToken(tokenPair.refreshToken),
          userId: stored.userId,
          expiresAt: tokenPair.refreshExpiresAt,
        },
      });
    });
    return this.buildAuthResponse(stored.user, tokenPair);
  }

  async logout(rawToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }

  private async issueTokenPair(user: User) {
    const tokenPair = await this.signTokenPair(user);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(tokenPair.refreshToken),
        userId: user.id,
        expiresAt: tokenPair.refreshExpiresAt,
      },
    });
    return this.buildAuthResponse(user, tokenPair);
  }

  private async signTokenPair(user: User) {
    const basePayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(basePayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
    });
    const refreshDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS', 30);
    const refreshToken = await this.jwt.signAsync(
      { ...basePayload, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: `${refreshDays}d`,
      },
    );
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: new Date(Date.now() + refreshDays * 86_400_000),
    };
  }

  private async buildAuthResponse(
    user: User,
    tokenPair: Awaited<ReturnType<AuthService['signTokenPair']>>,
  ) {
    const safeUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: publicUserSelect,
    });
    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: safeUser,
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
