import { Injectable } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService {
  private static readonly MAX_ENTRIES = 100_000;
  private static readonly SWEEP_INTERVAL = 1_000;
  private readonly entries = new Map<string, RateLimitEntry>();
  private operations = 0;

  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.operations += 1;
    if (
      this.operations % RateLimitService.SWEEP_INTERVAL === 0 ||
      this.entries.size >= RateLimitService.MAX_ENTRIES
    ) {
      this.removeExpired(now);
    }
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && this.entries.size >= RateLimitService.MAX_ENTRIES) {
        return false;
      }
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
