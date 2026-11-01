import { SocketConnectionLimitService } from './socket-connection-limit.service';

describe('SocketConnectionLimitService', () => {
  it('releases capacity when a socket disconnects', () => {
    const service = new SocketConnectionLimitService();

    expect(service.acquire('user', 'socket-1', 1)).toBe(true);
    expect(service.acquire('user', 'socket-2', 1)).toBe(false);
    service.release('user', 'socket-1');
    expect(service.acquire('user', 'socket-2', 1)).toBe(true);
  });
});
