import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppException } from "./api-error";

const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  /** max requests per window */
  limit: number;
  /** window in seconds */
  windowSec: number;
}

/** @RateLimit({ limit: 10, windowSec: 60 }) — per IP + route. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory sliding-window rate limiter. Good enough for a single instance;
 * swap the store for Redis when scaling horizontally.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const ip = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const key = `${ip}:${request.method}:${request.route?.path ?? request.url}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowSec * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.limit) {
      throw new AppException(429 as never, "יותר מדי בקשות. נסו שוב בעוד רגע.", "RATE_LIMITED");
    }

    // opportunistic cleanup
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (b.resetAt <= now) this.buckets.delete(k);
      }
    }
    return true;
  }
}
