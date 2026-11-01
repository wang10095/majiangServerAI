import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  it('shares an in-flight connection attempt', async () => {
    const service = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    let resolveConnection: (() => void) | undefined;
    const connection = new Promise<void>((resolve) => {
      resolveConnection = resolve;
    });
    const connect = jest
      .spyOn(service.client, 'connect')
      .mockReturnValue(connection);

    const first = service.connect();
    const second = service.connect();
    expect(connect).toHaveBeenCalledTimes(1);

    resolveConnection?.();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    service.client.disconnect();
  });
});
