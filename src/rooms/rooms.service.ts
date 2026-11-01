import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

const roomInclude = {
  members: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.RoomInclude;

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateRoomDto) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.room.create({
          data: {
            ...dto,
            ownerId,
            code: randomBytes(3).toString('hex').toUpperCase(),
            members: { create: { userId: ownerId, role: 'OWNER' } },
          },
          include: roomInclude,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
    }
    throw new ConflictException('Could not allocate room code');
  }

  async get(id: string, userId: string) {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: id, userId } },
    });
    if (!member) throw new ForbiddenException('Not a room member');
    return this.prisma.room.findUniqueOrThrow({
      where: { id },
      include: roomInclude,
    });
  }

  async join(userId: string, code: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const room = await tx.room.findUnique({
          where: { code: code.toUpperCase() },
          include: { members: true },
        });
        if (!room) throw new NotFoundException('Room not found');
        if (room.status !== RoomStatus.WAITING)
          throw new ConflictException('Room is not joinable');
        if (room.members.some((member) => member.userId === userId))
          return room;
        if (room.members.length >= room.maxPlayers)
          throw new ConflictException('Room is full');
        await tx.roomMember.create({ data: { roomId: room.id, userId } });
        return tx.room.findUniqueOrThrow({
          where: { id: room.id },
          include: roomInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async setReady(roomId: string, userId: string, ready: boolean) {
    await this.assertWaitingMember(roomId, userId);
    return this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { ready },
    });
  }

  async start(roomId: string, userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const room = await tx.room.findUnique({
          where: { id: roomId },
          include: { members: true },
        });
        if (!room) throw new NotFoundException('Room not found');
        if (room.ownerId !== userId)
          throw new ForbiddenException('Only owner can start the room');
        if (room.status !== RoomStatus.WAITING)
          throw new ConflictException('Room is not waiting');
        if (
          room.members.length < 2 ||
          room.members.some((member) => !member.ready)
        ) {
          throw new ConflictException('All players must be ready');
        }
        return tx.room.update({
          where: { id: roomId },
          data: { status: RoomStatus.PLAYING },
          include: roomInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async leave(roomId: string, userId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.ownerId === userId) {
      return this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.CLOSED },
      });
    }
    await this.prisma.roomMember.delete({
      where: { roomId_userId: { roomId, userId } },
    });
    return { left: true };
  }

  private async assertWaitingMember(roomId: string, userId: string) {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { room: true },
    });
    if (!member) throw new ForbiddenException('Not a room member');
    if (member.room.status !== RoomStatus.WAITING)
      throw new ConflictException('Room is not waiting');
  }
}
