import { z } from 'zod';

const booleanEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/i)
      .default('api'),
    CORS_ORIGINS: z.string().default('http://localhost:7456'),
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
    SERVE_TEST_CONSOLE: booleanEnv.optional(),
    SWAGGER_ENABLED: booleanEnv.optional(),
    HTTP_BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:kb|mb)$/i)
      .default('100kb'),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    HTTP_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    HTTP_KEEP_ALIVE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5000),
    SOCKET_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(65536),
    SOCKET_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10000),
    SOCKET_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    AUTH_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    SOCKET_RATE_WINDOW_MS: z.coerce.number().int().positive().default(1000),
    SOCKET_EVENT_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    SOCKET_GAME_INPUT_RATE_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    SOCKET_MAX_CONNECTIONS_PER_USER: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
  })
  .superRefine((config, context) => {
    if (config.HTTP_HEADERS_TIMEOUT_MS > config.HTTP_REQUEST_TIMEOUT_MS) {
      context.addIssue({
        code: 'custom',
        path: ['HTTP_HEADERS_TIMEOUT_MS'],
        message: 'must not exceed HTTP_REQUEST_TIMEOUT_MS',
      });
    }
    if (config.HTTP_KEEP_ALIVE_TIMEOUT_MS >= config.HTTP_HEADERS_TIMEOUT_MS) {
      context.addIssue({
        code: 'custom',
        path: ['HTTP_KEEP_ALIVE_TIMEOUT_MS'],
        message: 'must be lower than HTTP_HEADERS_TIMEOUT_MS',
      });
    }
  });

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables: ${result.error.message}`);
  }
  return result.data;
}
