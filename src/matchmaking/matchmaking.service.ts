import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async join(userId: string, gameMode: string) {
    let ticket;
    try {
      ticket = await this.prisma.matchTicket.create({
        data: { userId, queueKey: userId, gameMode },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Already queued');
      }
      throw error;
    }
    await this.addToRedis(ticket.id, gameMode);
    return ticket;
  }

  status(userId: string) {
    return this.prisma.matchTicket.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(userId: string) {
    const ticket = await this.prisma.matchTicket.findFirst({
      where: { userId, status: MatchStatus.QUEUED },
    });
    if (!ticket) throw new NotFoundException('No queued ticket');
    const updated = await this.prisma.matchTicket.update({
      where: { id: ticket.id },
      data: { status: MatchStatus.CANCELLED, queueKey: null },
    });
    await this.removeFromRedis(ticket.id, ticket.gameMode);
    return updated;
  }

  private async addToRedis(ticketId: string, gameMode: string) {
    try {
      if (await this.redis.connect())
        await this.redis.client.zadd(`match:${gameMode}`, Date.now(), ticketId);
    } catch (error) {
      this.logger.warn(
        `Could not index match ticket in Redis: ${String(error)}`,
      );
    }
  }

  private async removeFromRedis(ticketId: string, gameMode: string) {
    try {
      if (await this.redis.connect())
        await this.redis.client.zrem(`match:${gameMode}`, ticketId);
    } catch (error) {
      this.logger.warn(
        `Could not remove match ticket from Redis: ${String(error)}`,
      );
    }
  }
}
