import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const { status, detail } = this.resolveError(exception);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR)
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );

    response.status(status).json({
      success: false,
      error: detail,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveError(exception: unknown): {
    status: HttpStatus;
    detail: string | object;
  } {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        detail: exception.getResponse(),
      };
    }
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'statusCode' in exception &&
      typeof exception.statusCode === 'number' &&
      exception.statusCode >= 400 &&
      exception.statusCode < 500
    ) {
      return {
        status: exception.statusCode,
        detail:
          exception.statusCode === 413
            ? 'Request body is too large'
            : 'Invalid request',
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002')
        return {
          status: HttpStatus.CONFLICT,
          detail: 'Resource already exists',
        };
      if (exception.code === 'P2025')
        return { status: HttpStatus.NOT_FOUND, detail: 'Resource not found' };
      if (exception.code === 'P2003')
        return {
          status: HttpStatus.BAD_REQUEST,
          detail: 'Related resource not found',
        };
      if (exception.code === 'P2034')
        return {
          status: HttpStatus.CONFLICT,
          detail: 'Concurrent update conflict, retry the request',
        };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Internal server error',
    };
  }
}
