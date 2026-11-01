import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, name: string) {
    return this.prisma.team.create({
      data: {
        name,
        ownerId,
        members: { create: { userId: ownerId, role: 'OWNER' } },
      },
      include: {
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
      },
    });
  }

  listMine(userId: string) {
    return this.prisma.team.findMany({
      where: { members: { some: { userId } } },
      include: {
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
      },
    });
  }

  async addMember(teamId: string, ownerId: string, userId: string) {
    const team = await this.getOwned(teamId, ownerId);
    const exists = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (exists) throw new ConflictException('User is already a team member');
    return this.prisma.teamMember.create({ data: { teamId: team.id, userId } });
  }

  async removeMember(teamId: string, ownerId: string, userId: string) {
    await this.getOwned(teamId, ownerId);
    if (ownerId === userId)
      throw new ConflictException('Owner must disband the team');
    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
    return { removed: true };
  }

  async leave(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.ownerId === userId) {
      await this.prisma.team.delete({ where: { id: teamId } });
      return { disbanded: true };
    }
    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
    return { left: true };
  }

  private async getOwned(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.ownerId !== userId)
      throw new ForbiddenException('Only owner can manage the team');
    return team;
  }
}
