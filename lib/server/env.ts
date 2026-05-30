import { z } from "zod";

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
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  SIDH_ENV: z.enum(["uat", "production"]).default("uat"),
  SIDH_UAT_BASE_URL: z.string().trim().url(),
  SIDH_PROD_BASE_URL: z.string().trim().url(),
  SIDH_UAT_USERNAME: z.string().default(""),
  SIDH_UAT_PASSWORD: z.string().default(""),
  SIDH_PROD_USERNAME: z.string().default(""),
  SIDH_PROD_PASSWORD: z.string().default(""),
  SIDH_UAT_TP_ID: z.string().default(""),
  SIDH_PROD_TP_ID: z.string().default(""),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  SEED_ADMIN_NAME: z.string().trim().default("Platform Admin"),
  SEED_ADMIN_EMAIL: z.string().trim().email().default("admin@example.com"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("StrongPass@123"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function createEnv(source: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(source);
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

export function getSidhBaseUrl(env: AppEnv): string {
  return env.SIDH_ENV === "production" ? env.SIDH_PROD_BASE_URL : env.SIDH_UAT_BASE_URL;
}