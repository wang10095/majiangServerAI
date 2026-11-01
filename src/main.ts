import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  configureApp(app);

  const port = config.get<number>('PORT', 3000);
  const server = app.getHttpServer();
  server.requestTimeout = config.get<number>('HTTP_REQUEST_TIMEOUT_MS', 60000);
  server.headersTimeout = config.get<number>('HTTP_HEADERS_TIMEOUT_MS', 30000);
  server.keepAliveTimeout = config.get<number>(
    'HTTP_KEEP_ALIVE_TIMEOUT_MS',
    5000,
  );
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
