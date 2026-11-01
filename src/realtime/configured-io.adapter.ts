import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.origins,
        credentials: true,
      },
      maxHttpBufferSize: this.config.get<number>(
        'SOCKET_MAX_PAYLOAD_BYTES',
        65536,
      ),
      connectTimeout: this.config.get<number>(
        'SOCKET_CONNECT_TIMEOUT_MS',
        10000,
      ),
      pingTimeout: this.config.get<number>('SOCKET_PING_TIMEOUT_MS', 20000),
    }) as Server;
  }
}
