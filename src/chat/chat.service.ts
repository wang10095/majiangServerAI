import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ChatScope, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async send(senderId: string, dto: SendMessageDto) {
    if (!dto.targetId || dto.scope === ChatScope.SYSTEM)
      throw new BadRequestException('A valid target is required');
    const data: Prisma.ChatMessageUncheckedCreateInput = {
      senderId,
      scope: dto.scope,
      content: dto.content.trim(),
    };
    if (dto.scope === ChatScope.PRIVATE) data.recipientId = dto.targetId;
    if (dto.scope === ChatScope.TEAM) {
      await this.assertTeamMember(dto.targetId, senderId);
      data.teamId = dto.targetId;
    }
    if (dto.scope === ChatScope.ROOM) {
      await this.assertRoomMember(dto.targetId, senderId);
      data.roomId = dto.targetId;
    }
    return this.prisma.chatMessage.create({
      data,
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async history(
    userId: string,
    scope: ChatScope,
    targetId: string,
    before?: string,
  ) {
    const where: Prisma.ChatMessageWhereInput = {};
    if (scope === ChatScope.PRIVATE) {
      where.OR = [
        { senderId: userId, recipientId: targetId },
        { senderId: targetId, recipientId: userId },
      ];
    } else if (scope === ChatScope.TEAM) {
      await this.assertTeamMember(targetId, userId);
      where.teamId = targetId;
    } else if (scope === ChatScope.ROOM) {
      await this.assertRoomMember(targetId, userId);
      where.roomId = targetId;
    } else throw new BadRequestException('Unsupported chat scope');
    if (before) where.createdAt = { lt: new Date(before) };
    return this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  private async assertTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a team member');
  }

  private async assertRoomMember(roomId: string, userId: string) {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a room member');
  }
}
