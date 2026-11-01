import { validateEnv } from './env.validation';

const requiredEnv = {
  DATABASE_URL: 'postgresql://localhost/database',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('parses explicit production security settings', () => {
    const result = validateEnv({
      ...requiredEnv,
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: '1',
      SERVE_TEST_CONSOLE: 'false',
      SWAGGER_ENABLED: 'false',
      HTTP_BODY_LIMIT: '64kb',
    });

    expect(result.TRUST_PROXY_HOPS).toBe(1);
    expect(result.SERVE_TEST_CONSOLE).toBe(false);
    expect(result.SWAGGER_ENABLED).toBe(false);
    expect(result.HTTP_BODY_LIMIT).toBe('64kb');
  });

  it('rejects invalid boolean configuration', () => {
    expect(() =>
      validateEnv({ ...requiredEnv, SWAGGER_ENABLED: 'sometimes' }),
    ).toThrow('Invalid environment variables');
  });

  it('rejects inconsistent HTTP timeout settings', () => {
    expect(() =>
      validateEnv({
        ...requiredEnv,
        HTTP_REQUEST_TIMEOUT_MS: '10000',
        HTTP_HEADERS_TIMEOUT_MS: '11000',
      }),
    ).toThrow('HTTP_HEADERS_TIMEOUT_MS');

    expect(() =>
      validateEnv({
        ...requiredEnv,
        HTTP_HEADERS_TIMEOUT_MS: '5000',
        HTTP_KEEP_ALIVE_TIMEOUT_MS: '5000',
      }),
    ).toThrow('HTTP_KEEP_ALIVE_TIMEOUT_MS');
  });
});
