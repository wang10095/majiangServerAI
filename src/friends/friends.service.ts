import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { publicUserSelect } from '../users/users.service';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: publicUserSelect },
        addressee: { select: publicUserSelect },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async request(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId)
      throw new BadRequestException('Cannot add yourself');
    const addressee = await this.prisma.user.findUnique({
      where: { id: addresseeId },
    });
    if (!addressee) throw new NotFoundException('User not found');
    try {
      return await this.prisma.friendship.create({
        data: {
          requesterId,
          addresseeId,
          pairKey: [requesterId, addresseeId].sort().join(':'),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Friend relationship already exists');
      }
      throw error;
    }
  }

  async accept(id: string, userId: string) {
    const friendship = await this.find(id);
    if (friendship.addresseeId !== userId) throw new ForbiddenException();
    if (friendship.status !== FriendshipStatus.PENDING)
      throw new ConflictException('Request is not pending');
    return this.prisma.friendship.update({
      where: { id },
      data: { status: FriendshipStatus.ACCEPTED },
    });
  }

  async remove(id: string, userId: string) {
    const friendship = await this.find(id);
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId)
      throw new ForbiddenException();
    await this.prisma.friendship.delete({ where: { id } });
    return { removed: true };
  }

  private async find(id: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id },
    });
    if (!friendship) throw new NotFoundException('Friend request not found');
    return friendship;
  }
}
