import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('rejects requests after the configured limit', () => {
    const service = new RateLimitService();

    expect(service.consume('key', 2, 1000)).toBe(true);
    expect(service.consume('key', 2, 1000)).toBe(true);
    expect(service.consume('key', 2, 1000)).toBe(false);
  });

  it('removes expired entries during a periodic sweep', () => {
    const service = new RateLimitService();
    const internal = service as unknown as {
      entries: Map<string, { count: number; resetAt: number }>;
      operations: number;
    };
    internal.entries.set('expired', { count: 1, resetAt: 0 });
    internal.operations = 999;

    expect(service.consume('active', 1, 1000)).toBe(true);
    expect(internal.entries.has('expired')).toBe(false);
  });
});
