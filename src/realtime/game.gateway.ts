import {
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomMemberRole, RoomStatus } from '@prisma/client';
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
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../database/prisma.service';
import { GameInputDto } from './dto/game-input.dto';
import { JoinGameRoomDto } from './dto/join-game-room.dto';
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
@WebSocketGateway({ namespace: '/game' })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly auth: RealtimeAuthService,
    private readonly prisma: PrismaService,
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

  handleConnection(): void {}

  handleDisconnect(socket: Socket) {
    const user = (socket.data as { user?: AuthenticatedUser }).user;
    if (user) this.connections.release(user.userId, socket.id);
  }

  @SubscribeMessage('room:join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: JoinGameRoomDto,
  ) {
    await this.prisma.roomMember.findUniqueOrThrow({
      where: {
        roomId_userId: {
          roomId: dto.roomId,
          userId: this.getUser(socket).userId,
        },
      },
    });
    await socket.join(`game:${dto.roomId}`);
    await socket.join(`game:${dto.roomId}:user:${this.getUser(socket).userId}`);
    socket
      .to(`game:${dto.roomId}`)
      .emit('player:joined', { userId: this.getUser(socket).userId });
    return { event: 'room:joined', data: { roomId: dto.roomId } };
  }

  @SubscribeMessage('game:input')
  async input(
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: GameInputDto,
  ) {
    if (!socket.rooms.has(`game:${dto.roomId}`))
      return { event: 'game:error', data: { message: 'Join room first' } };
    if (Buffer.byteLength(JSON.stringify(dto.input), 'utf8') > 4096)
      return { event: 'game:error', data: { message: 'Input is too large' } };

    const userId = this.getUser(socket).userId;
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: dto.roomId, userId } },
      include: { room: { select: { status: true } } },
    });
    if (!member || member.room.status !== RoomStatus.PLAYING) {
      await socket.leave(`game:${dto.roomId}`);
      return { event: 'game:error', data: { message: 'Room is not playable' } };
    }
    if (member.role === RoomMemberRole.SPECTATOR)
      return {
        event: 'game:error',
        data: { message: 'Spectators cannot play' },
      };

    const sequences = this.getSequences(socket);
    const previousSequence = sequences.get(dto.roomId) ?? -1;
    if (dto.sequence <= previousSequence)
      return { event: 'game:error', data: { message: 'Stale input sequence' } };
    sequences.set(dto.roomId, dto.sequence);
    const recipients = await this.prisma.roomMember.findMany({
      where: { roomId: dto.roomId, userId: { not: userId } },
      select: { userId: true },
    });
    this.server
      .to(
        recipients.map(
          (recipient) => `game:${dto.roomId}:user:${recipient.userId}`,
        ),
      )
      .emit('game:input', {
        userId,
        sequence: dto.sequence,
        input: dto.input,
      });
    return { event: 'game:input:accepted', data: { sequence: dto.sequence } };
  }

  private getUser(socket: Socket): AuthenticatedUser {
    const user = (socket.data as { user?: AuthenticatedUser }).user;
    if (!user) throw new Error('Socket is not authenticated');
    return user;
  }

  private getSequences(socket: Socket): Map<string, number> {
    const data = socket.data as { sequences?: Map<string, number> };
    data.sequences ??= new Map<string, number>();
    return data.sequences;
  }
}
