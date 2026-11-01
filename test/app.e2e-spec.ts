import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { io } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

describe('Application (e2e)', () => {
  let app: NestExpressApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    app.set('trust proxy', 1);
    await app.listen(0, '127.0.0.1');
  });

  afterAll(() => app.close());

  it('serves test console assets without forcing an HTTPS upgrade', async () => {
    const page = await request(app.getHttpServer()).get('/').expect(200);

    expect(page.headers['content-security-policy']).toBeDefined();
    expect(page.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );

    await request(app.getHttpServer())
      .get('/styles.css')
      .expect('Content-Type', /text\/css/)
      .expect(200);
  });

  it('rejects unauthenticated protected endpoints', () => {
    return request(app.getHttpServer()).get('/api/users/me').expect(401);
  });

  it('rejects unknown DTO fields', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.11')
      .send({ username: 'nobody', password: 'invalid', admin: true })
      .expect(400);
  });

  it.each(['/platform', '/game'])(
    'rejects unauthenticated %s socket connections',
    async (namespace) => {
      const socket = io(`${await app.getUrl()}${namespace}`, {
        forceNew: true,
        reconnection: false,
        timeout: 2000,
        transports: ['websocket'],
      });

      const error = await new Promise<Error & { data?: { code?: string } }>(
        (resolve, reject) => {
          socket.once('connect', () => reject(new Error('Socket connected')));
          socket.once('connect_error', resolve);
        },
      );
      socket.close();

      expect(error.data?.code).toBe('UNAUTHORIZED');
    },
  );

  it('limits repeated authentication attempts by IP and endpoint', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.10')
        .send({ username: 'rate_limit_user', password: 'InvalidPassword123!' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ username: 'rate_limit_user', password: 'InvalidPassword123!' })
      .expect(429);
  });

  it('rejects request bodies larger than the configured limit', () => {
    return request(app.getHttpServer())
      .post('/api/auth/guest')
      .send({ displayName: 'x'.repeat(101 * 1024) })
      .expect(413);
  });

  it('registers a user and reads its profile', async () => {
    interface ApiResponse<T> {
      data: T;
    }

    const username = `e2e_${Date.now()}`;
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password: 'TestPassword123!', displayName: 'E2E User' })
      .expect(201);

    const registeredBody = registered.body as ApiResponse<{
      accessToken: string;
    }>;
    accessToken = registeredBody.data.accessToken;
    const profile = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const profileBody = profile.body as ApiResponse<{
      username: string;
      passwordHash?: string;
    }>;
    expect(profileBody.data.username).toBe(username);
    expect(profileBody.data.passwordHash).toBeUndefined();
  });

  it.each(['/platform', '/game'])(
    'accepts authenticated %s socket connections',
    async (namespace) => {
      const socket = io(`${await app.getUrl()}${namespace}`, {
        auth: { token: accessToken },
        forceNew: true,
        reconnection: false,
        timeout: 2000,
        transports: ['websocket'],
      });

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      await new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
        socket.close();
      });
    },
  );
});
