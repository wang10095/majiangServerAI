import {
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatScope } from '@prisma/client';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { ChatService } from '../chat/chat.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SendMessageDto } from '../chat/dto/send-message.dto';
import { JoinChannelDto } from './dto/join-channel.dto';
import { RealtimeAuthService } from './realtime-auth.service';
import { SocketConnectionLimitService } from './socket-connection-limit.service';
import { SocketExceptionFilter } from './socket-exception.filter';
import { SocketRateLimitGuard } from './socket-rate-limit.guard';

@UseFilters(SocketExceptionFilter)
@UseGuards(SocketRateLimitGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@WebSocketGateway({ namespace: '/platform' })
export class PlatformGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly auth: RealtimeAuthService,
    private readonly chat: ChatService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly connections: SocketConnectionLimitService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authorizeConnection(socket, next);
    });
  }

  private async authorizeConnection(
    socket: Socket,
    next: (error?: Error) => void,
  ): Promise<void> {
    try {
      const user = await this.auth.authenticate(socket);
      if (!user) {
        const error = new Error('UNAUTHORIZED') as Error & {
          data?: { code: string; message: string };
        };
        error.data = {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        };
        return next(error);
      }
      const connectionLimit = this.config.get<number>(
        'SOCKET_MAX_CONNECTIONS_PER_USER',
        5,
      );
      if (!this.connections.acquire(user.userId, socket.id, connectionLimit)) {
        const error = new Error('CONNECTION_LIMIT') as Error & {
          data?: { code: string; message: string };
        };
        error.data = {
          code: 'CONNECTION_LIMIT',
          message: 'Too many active connections',
        };
        return next(error);
      }
      (socket.data as { user?: AuthenticatedUser }).user = user;
      socket.conn.once('close', () => {
        this.connections.release(user.userId, socket.id);
      });
      next();
    } catch {
      const error = new Error('AUTHENTICATION_FAILED') as Error & {
        data?: { code: string; message: string };
      };
      error.data = {
        code: 'AUTHENTICATION_FAILED',
        message: 'Realtime authentication failed',
      };
      next(error);
    }
  }

  handleConnection(socket: Socket): void {
    void this.initializeConnection(socket);
  }

  handleDisconnect(socket: Socket): void {
    const user = this.getUser(socket, false);
    if (!user) return;
    this.connections.release(user.userId, socket.id);
    void this.cleanupConnection(socket, user);
  }

  private async initializeConnection(socket: Socket): Promise<void> {
    const user = this.getUser(socket);
    try {
      await socket.join(`user:${user.userId}`);
      await this.prisma.user.update({
        where: { id: user.userId },
        data: { lastSeenAt: new Date() },
      });
      if (await this.redis.connect()) {
        const key = `online:user:${user.userId}`;
        await this.redis.client
          .multi()
          .sadd(key, socket.id)
          .expire(key, 86400)
          .exec();
      }
    } catch {
      this.connections.release(user.userId, socket.id);
      socket.emit('server:error', {
        code: 'CONNECTION_SETUP_FAILED',
        message: 'Realtime connection setup failed',
      });
      socket.disconnect(true);
    }
  }

  private async cleanupConnection(
    socket: Socket,
    user: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: user.userId },
        data: { lastSeenAt: new Date() },
      });
      if (await this.redis.connect()) {
        await this.redis.client.srem(`online:user:${user.userId}`, socket.id);
      }
    } catch {
      return;
    }
  }

  @SubscribeMessage('channel:join')
  async joinChannel(
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: JoinChannelDto,
  ) {
    const userId = this.getUser(socket).userId;
    if (dto.scope === ChatScope.TEAM) {
      await this.prisma.teamMember.findUniqueOrThrow({
        where: { teamId_userId: { teamId: dto.targetId, userId } },
      });
      await socket.join(`team:${dto.targetId}`);
    } else if (dto.scope === ChatScope.ROOM) {
      await this.prisma.roomMember.findUniqueOrThrow({
        where: { roomId_userId: { roomId: dto.targetId, userId } },
      });
      await socket.join(`room:${dto.targetId}`);
    }
    return { event: 'channel:joined', data: dto };
  }

  @SubscribeMessage('chat:send')
  async send(
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = this.getUser(socket).userId;
    const message = await this.chat.send(senderId, dto);
    const recipients = (await this.getMessageRecipients(dto)).filter(
      (userId) => userId !== senderId,
    );
    this.server
      .to(recipients.map((userId) => `user:${userId}`))
      .emit('chat:message', message);
    socket.emit('chat:message', message);
    return { event: 'chat:sent', data: { id: message.id } };
  }

  private async getMessageRecipients(dto: SendMessageDto): Promise<string[]> {
    if (dto.scope === ChatScope.PRIVATE) return [dto.targetId!];
    if (dto.scope === ChatScope.TEAM) {
      const members = await this.prisma.teamMember.findMany({
        where: { teamId: dto.targetId },
        select: { userId: true },
      });
      return members.map((member) => member.userId);
    }
    const members = await this.prisma.roomMember.findMany({
      where: { roomId: dto.targetId },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  private getUser(socket: Socket): AuthenticatedUser;
  private getUser(socket: Socket, required: true): AuthenticatedUser;
  private getUser(
    socket: Socket,
    required: false,
  ): AuthenticatedUser | undefined;
  private getUser(
    socket: Socket,
    required = true,
  ): AuthenticatedUser | undefined {
    const user = (socket.data as { user?: AuthenticatedUser }).user;
    if (!user && required) throw new Error('Socket is not authenticated');
    return user;
  }
}
