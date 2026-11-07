import { Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthProtocol, AuthRequestData } from './auth.protocol';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth/protobuf')
export class AuthProtobufController {
  private readonly protocol = new AuthProtocol();

  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Req() request: Request, @Res() response: Response): void {
    void this.handle(request, response, false);
  }

  @Public()
  @Post('login')
  login(@Req() request: Request, @Res() response: Response): void {
    void this.handle(request, response, true);
  }

  private async handle(
    request: Request,
    response: Response,
    login: boolean,
  ): Promise<void> {
    response.type('application/x-protobuf');
    try {
      const data = this.protocol.decodeRequest(request.body as Buffer);
      this.validate(data, login);
      const result = login
        ? await this.auth.login({ username: data.username, password: data.password })
        : await this.auth.register({
            username: data.username,
            password: data.password,
            displayName: data.displayName!,
          });
      response.status(HttpStatus.OK).send(
        this.protocol.encodeResponse({
          success: true,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      const status = typeof error === 'object' && error !== null && 'getStatus' in error
        ? Number((error as { getStatus: () => number }).getStatus())
        : HttpStatus.BAD_REQUEST;
      response.status(status).send(
        this.protocol.encodeResponse({
          success: false,
          error: message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private validate(data: AuthRequestData, login: boolean): void {
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(data.username)) {
      throw new Error('Username must be 3-32 letters, numbers, or underscores');
    }
    if (data.password.length < 1 || data.password.length > 16) {
      throw new Error('Password must be 1-16 characters');
    }
    if (!login && (!data.displayName || data.displayName.length < 1 || data.displayName.length > 32)) {
      throw new Error('Display name must be 1-32 characters');
    }
  }
}