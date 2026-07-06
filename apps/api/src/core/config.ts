import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().default("http://localhost:3000"),
  API_URL: z.string().default("http://localhost:4000"),

  DATABASE_URL: z.string(),

  REDIS_URL: z.string().optional().or(z.literal("")),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be 32 bytes hex (openssl rand -hex 32)"),
  CREDENTIALS_KEY_VERSION: z.coerce.number().default(1),

  META_MODE: z.enum(["mock", "marketing-api", "mcp"]).default("mock"),
  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_GRAPH_VERSION: z.string().default("v23.0"),
  META_OAUTH_REDIRECT_URI: z
    .string()
    .default("http://localhost:4000/api/v1/meta/connect/callback"),
  META_OAUTH_SCOPES: z.string().default("ads_read,business_management,pages_show_list"),

  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().default("claude-sonnet-5"),

  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("campaignos-assets"),
  S3_ACCESS_KEY: z.string().optional().default(""),
  S3_SECRET_KEY: z.string().optional().default(""),

  LOG_LEVEL: z.string().default("info"),
  SENTRY_DSN: z.string().optional().default(""),

  // Background scheduler (periodic insights sync). Off by default in dev.
  ENABLE_CRON: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(60),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper. */
export function resetConfigCache(): void {
  cached = null;
}
