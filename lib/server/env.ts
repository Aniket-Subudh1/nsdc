import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}, z.boolean());

function stripEnvQuotes(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeLegacyEmailUser(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.includes("@")) {
    return trimmed;
  }

  return `${trimmed}@gmail.com`;
}

function resolveSmtpSettings(source: NodeJS.ProcessEnv) {
  const smtpHost = source.SMTP_HOST?.trim() || "";
  const smtpUser =
    source.SMTP_USER?.trim() || normalizeLegacyEmailUser(source.EMAIL_USER?.trim() || "");
  const smtpPass = source.SMTP_PASS?.trim() || source.EMAIL_APP_PASSWORD?.trim() || "";
  const smtpFrom =
    stripEnvQuotes(source.FROM_EMAIL?.trim() || "") ||
    stripEnvQuotes(source.SMTP_FROM?.trim() || "") ||
    source.OWNER_EMAIL?.trim() ||
    "";

  return {
    SMTP_HOST: smtpHost,
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
    SMTP_FROM: smtpFrom,
  };
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.string().trim().min(1).default("local"),
  DATABASE_URL: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
      "DATABASE_URL must be a MongoDB connection string",
    ),
  REDIS_URL: z.string().trim().url().or(z.literal("")).default(""),
  QUEUE_DRIVER: z.enum(["auto", "redis", "mongo"]).default("auto"),
  REDIS_TLS: z.enum(["auto", "true", "false"]).default("auto"),
  REDIS_KEY_PREFIX: z.string().trim().default(""),
  SIDH_PUSH_CONCURRENCY: z.coerce.number().int().positive().max(64).default(5),
  SIDH_RATE_LIMIT_PER_SEC: z.coerce.number().int().positive().max(200).default(10),
  SIDH_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  SIDH_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(6),
  SIDH_LEASE_TTL_MS: z.coerce.number().int().positive().default(120_000),
  SIDH_TXN_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
  WORKER_BATCH_LIMIT: z.coerce.number().int().positive().max(500).default(25),
  SIDH_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  SIDH_CIRCUIT_BREAKER_MIN_SAMPLES: z.coerce.number().int().positive().default(10),
  SIDH_CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
  CACHE_DASHBOARD_TTL_SEC: z.coerce.number().int().nonnegative().default(45),
  CACHE_OPTIONS_TTL_SEC: z.coerce.number().int().nonnegative().default(300),
  CACHE_ANALYTICS_TTL_SEC: z.coerce.number().int().nonnegative().default(120),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  SMTP_HOST: z.string().trim().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv,
  SMTP_USER: z.string().trim().default(""),
  SMTP_PASS: z.string().trim().default(""),
  SMTP_FROM: z.string().trim().default(""),
  SIDH_ENV: z.enum(["uat", "production"]).default("uat"),
  SIDH_UAT_BASE_URL: z.string().trim().url(),
  SIDH_PROD_BASE_URL: z.string().trim().url(),
  SIDH_UAT_USERNAME: z.string().default(""),
  SIDH_UAT_PASSWORD: z.string().default(""),
  SIDH_PROD_USERNAME: z.string().default(""),
  SIDH_PROD_PASSWORD: z.string().default(""),
  SIDH_UAT_TP_ID: z.string().default(""),
  SIDH_PROD_TP_ID: z.string().default(""),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().optional(),
  PASSWORD_RESET_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  LOGIN_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  SEED_ADMIN_NAME: z.string().trim().default("Platform Admin"),
  SEED_ADMIN_EMAIL: z.string().trim().email().default("admin@example.com"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("StrongPass@123"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function createEnv(source: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse({
    ...source,
    ...resolveSmtpSettings(source),
  });
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = createEnv(process.env);
  }

  return cachedEnv;
}

export function resetEnvCache() {
  cachedEnv = undefined;
}

export function resolveQueueDriverKind(env: AppEnv): "redis" | "mongo" {
  if (env.QUEUE_DRIVER === "redis") {
    return "redis";
  }

  if (env.QUEUE_DRIVER === "mongo") {
    return "mongo";
  }

  return env.REDIS_URL.trim() ? "redis" : "mongo";
}

export function resolveRedisKeyPrefix(env: AppEnv): string {
  return env.REDIS_KEY_PREFIX.trim() || `nsdc:${env.APP_ENV}:`;
}

export function resolveRedisTlsEnabled(env: AppEnv): boolean {
  if (env.REDIS_TLS === "true") {
    return true;
  }

  if (env.REDIS_TLS === "false") {
    return false;
  }

  const url = env.REDIS_URL.trim();
  if (!url) {
    return false;
  }

  if (url.startsWith("rediss://")) {
    return true;
  }

  return /\.cache\.amazonaws\.com/i.test(url);
}

export function getSidhBaseUrl(env: AppEnv): string {
  return env.SIDH_ENV === "production" ? env.SIDH_PROD_BASE_URL : env.SIDH_UAT_BASE_URL;
}

export function getSidhCredentials(env: AppEnv) {
  const isProduction = env.SIDH_ENV === "production";
  const username = isProduction ? env.SIDH_PROD_USERNAME : env.SIDH_UAT_USERNAME;
  const configuredTpId = isProduction ? env.SIDH_PROD_TP_ID : env.SIDH_UAT_TP_ID;

  return {
    baseUrl: getSidhBaseUrl(env),
    password: isProduction ? env.SIDH_PROD_PASSWORD : env.SIDH_UAT_PASSWORD,
    tpId: configuredTpId.trim() || username,
    username,
  };
}

export function getSidhBatchContext(source: NodeJS.ProcessEnv = process.env) {
  try {
    const env = createEnv(source);
    return {
      environment: env.SIDH_ENV,
      tpId: getSidhCredentials(env).tpId,
    };
  } catch {
    const environment = source.SIDH_ENV === "production" ? "production" : "uat";
    const tpId = (environment === "production" ? source.SIDH_PROD_TP_ID : source.SIDH_UAT_TP_ID)?.trim() || "";

    return {
      environment,
      tpId,
    };
  }
}