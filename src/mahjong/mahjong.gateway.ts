import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { RealtimeAuthService } from '../realtime/realtime-auth.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MahjongProtocolService } from './mahjong-protocol.service';
import { MahjongService } from './mahjong.service';

@WebSocketGateway({ namespace: '/mahjong' })
export class MahjongGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly games: MahjongService,
    private readonly protocol: MahjongProtocolService,
    private readonly auth: RealtimeAuthService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket, next);
    });
  }

  handleConnection(socket: Socket): void {
    socket.emit('mahjong:ready', { protocolVersion: 1 });
  }

  @SubscribeMessage('mahjong:start-single')
  async startSingle(@ConnectedSocket() socket: Socket) {
    const userId = this.getUser(socket).userId;
    // 创建单机局时由服务端生成牌墙和机器人，客户端只收到自己的视角快照。
    const state = await this.games.createSinglePlayerGame(userId);
    return this.protocol.encodeSnapshot({
      gameId: state.gameId,
      eventSeq: state.eventSeq,
      stateVersion: state.stateVersion,
      snapshot: this.games.projectState(state.gameId, userId),
    });
  }

  @SubscribeMessage('mahjong:command')
  async command(@ConnectedSocket() socket: Socket, @MessageBody() payload: Buffer) {
    const userId = this.getUser(socket).userId;
    const command = this.protocol.decodeCommand(payload);
    // Protobuf 只负责编码，动作是否合法仍由 MahjongService 和 MahjongEngine 决定。
    const response = await this.games.applyCommand(
      userId,
      command.gameId,
      command.requestId,
      command.type,
      command.tile,
      command.tiles,
      command.clientSeq,
    );
    return this.protocol.encodeEvent({
      gameId: command.gameId,
      eventSeq: response.state.eventSeq,
      stateVersion: response.state.stateVersion,
      ...response.result,
    });
  }

  @SubscribeMessage('mahjong:snapshot')
  async snapshot(@ConnectedSocket() socket: Socket, @MessageBody() payload: Buffer) {
    const userId = this.getUser(socket).userId;
    const request = this.protocol.decodeSnapshotRequest(payload);
    const state = await this.games.restoreGame(request.gameId, userId);
    return this.protocol.encodeSnapshot({
      gameId: state.gameId,
      eventSeq: state.eventSeq,
      stateVersion: state.stateVersion,
      snapshot: this.games.projectState(state.gameId, userId),
    });
  }

  @SubscribeMessage('mahjong:watch')
  async watch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { gameId?: string },
  ) {
    const userId = this.getUser(socket).userId;
    const gameId = String(payload?.gameId ?? '');
    await this.games.restoreGame(gameId, userId);
    const room = `mahjong:${gameId}:user:${userId}`;
    await socket.join(room);
    const unsubscribe = this.games.subscribeState(gameId, userId, (snapshot) => {
      socket.emit('mahjong:state', snapshot);
    });
    const subscriptions = this.getSubscriptions(socket);
    subscriptions.get(gameId)?.();
    subscriptions.set(gameId, unsubscribe);
    socket.emit('mahjong:state', this.games.projectState(gameId, userId));
    return { event: 'mahjong:watching', gameId };
  }

  handleDisconnect(socket: Socket): void {
    this.getSubscriptions(socket).forEach((unsubscribe) => unsubscribe());
  }

  private async authenticate(socket: Socket, next: (error?: Error) => void): Promise<void> {
    const user = await this.auth.authenticate(socket);
    if (!user) return next(new Error('UNAUTHORIZED'));
    (socket.data as { user?: AuthenticatedUser }).user = user;
    next();
  }

  private getUser(socket: Socket): AuthenticatedUser {
    const user = (socket.data as { user?: AuthenticatedUser }).user;
    if (!user) throw new Error('UNAUTHORIZED');
    return user;
  }

  private getSubscriptions(socket: Socket): Map<string, () => void> {
    const data = socket.data as { mahjongSubscriptions?: Map<string, () => void> };
    data.mahjongSubscriptions ??= new Map<string, () => void>();
    return data.mahjongSubscriptions;
  }
}
