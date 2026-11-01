import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface SocketErrorResponse {
  code: string;
  message: string | string[];
}

@Catch()
export class SocketExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SocketExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const socket = host.switchToWs().getClient<Socket>();
    const response = this.toResponse(exception);
    if (response.code === 'INTERNAL_ERROR') {
      this.logger.error(exception);
    }
    socket.emit('server:error', response);
  }

  private toResponse(exception: unknown): SocketErrorResponse {
    if (exception instanceof WsException) {
      const error = exception.getError();
      if (typeof error === 'object' && error !== null) {
        const value = error as Partial<SocketErrorResponse>;
        return {
          code: value.code ?? 'BAD_REQUEST',
          message: value.message ?? 'Realtime request failed',
        };
      }
      return { code: 'BAD_REQUEST', message: String(error) };
    }
    if (typeof exception === 'object' && exception !== null) {
      const candidate = exception as { getResponse?: unknown };
      if (typeof candidate.getResponse !== 'function') {
        return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
      }
      const getResponse = candidate.getResponse as () =>
        string | { message?: string | string[] };
      const response = getResponse.call(exception);
      return {
        code: 'BAD_REQUEST',
        message:
          typeof response === 'string'
            ? response
            : (response.message ?? 'Realtime request failed'),
      };
    }
    return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
}
