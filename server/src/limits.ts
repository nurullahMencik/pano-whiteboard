/** Classic token bucket. `take` returns false when the caller is over its budget. */
export class TokenBucket {
  private tokens: number
  private last: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity
    this.last = now()
  }

  take(amount = 1): boolean {
    const current = this.now()
    const elapsed = (current - this.last) / 1000
    this.last = current
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond)
    if (this.tokens < amount) return false
    this.tokens -= amount
    return true
  }
}

/**
 * Tracks concurrent connections and the connection rate per IP address.
 * Buckets for idle IPs are dropped by `sweep` so memory stays bounded.
 */
export class IpLimiter {
  private readonly active = new Map<string, number>()
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>()

  constructor(
    private readonly maxConcurrent: number,
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns a rejection reason, or null when the connection may proceed. */
  tryAcquire(ip: string): 'too-many-connections' | 'rate-limited' | null {
    if ((this.active.get(ip) ?? 0) >= this.maxConcurrent) return 'too-many-connections'
    let entry = this.buckets.get(ip)
    if (!entry) {
      const burst = Math.max(1, Math.ceil(this.perMinute / 2))
      entry = { bucket: new TokenBucket(burst, this.perMinute / 60, this.now), seen: this.now() }
      this.buckets.set(ip, entry)
    }
    entry.seen = this.now()
    if (!entry.bucket.take()) return 'rate-limited'
    this.active.set(ip, (this.active.get(ip) ?? 0) + 1)
    return null
  }

  release(ip: string): void {
    const count = (this.active.get(ip) ?? 0) - 1
    if (count <= 0) this.active.delete(ip)
    else this.active.set(ip, count)
  }

  sweep(maxIdleMs = 10 * 60_000): void {
    const threshold = this.now() - maxIdleMs
    for (const [ip, entry] of this.buckets) {
      if (entry.seen < threshold && !this.active.has(ip)) this.buckets.delete(ip)
    }
  }

  activeCount(ip: string): number {
    return this.active.get(ip) ?? 0
  }
}
