import { ArgumentsHost } from '@nestjs/common';
import { SocketExceptionFilter } from './socket-exception.filter';

describe('SocketExceptionFilter', () => {
  it('does not expose unknown exception details', () => {
    const emit = jest.fn();
    const host = {
      switchToWs: () => ({ getClient: () => ({ emit }) }),
    } as unknown as ArgumentsHost;

    new SocketExceptionFilter().catch(new Error('database secret'), host);

    expect(emit).toHaveBeenCalledWith('server:error', {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
