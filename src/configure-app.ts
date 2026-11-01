import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ConfiguredIoAdapter } from './realtime/configured-io.adapter';

export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api');
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const serveTestConsole = config.get<boolean>(
    'SERVE_TEST_CONSOLE',
    !isProduction,
  );
  const origins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.set('trust proxy', config.get<number>('TRUST_PROXY_HOPS', 0));
  app.use(
    helmet({
      contentSecurityPolicy: serveTestConsole
        ? { directives: { upgradeInsecureRequests: null } }
        : undefined,
    }),
  );
  app.useBodyParser('json', {
    limit: config.get<string>('HTTP_BODY_LIMIT', '100kb'),
  });
  app.useBodyParser('urlencoded', {
    limit: config.get<string>('HTTP_BODY_LIMIT', '100kb'),
    extended: true,
  });
  if (serveTestConsole) {
    app.useStaticAssets(join(process.cwd(), 'public'));
  }
  app.enableCors({ origin: origins, credentials: true });
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, origins, config));
  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();

  if (config.get<boolean>('SWAGGER_ENABLED', !isProduction)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('V萌猫小筑 Game Server')
      .setDescription('HTTP and realtime APIs for the game platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      `${prefix}/docs`,
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }
}
