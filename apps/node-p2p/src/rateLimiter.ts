type Key = string;

interface Counter {
  count: number;
  windowStart: number;
}

export class FixedWindowRateLimiter {
  private readonly limit: number | null;
  private readonly windowMs: number;
  private readonly counters = new Map<Key, Counter>();

  constructor(limit: number | null, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  allow(key: Key): boolean {
    if (this.limit == null) return true;

    const now = Date.now();
    const existing = this.counters.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.counters.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (existing.count < this.limit) {
      existing.count += 1;
      return true;
    }

    return false;
  }
}

