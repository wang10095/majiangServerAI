import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private connectionPromise?: Promise<boolean>;
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (error) =>
      this.logger.warn(`Redis unavailable: ${error.message}`),
    );
  }

  async connect(): Promise<boolean> {
    if (this.client.status === 'ready') return true;
    if (this.connectionPromise) return this.connectionPromise;
    this.connectionPromise = this.client
      .connect()
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        this.connectionPromise = undefined;
      });
    return this.connectionPromise;
  }

  async onModuleDestroy() {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    if (this.client.status !== 'end') this.client.disconnect();
  }
}
