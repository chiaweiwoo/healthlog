import { z } from "zod";

function optionalNonEmptyString(schema: z.ZodString) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  }, schema.optional());
}

const serverEnvSchema = z.object({
  APP_USERNAME: optionalNonEmptyString(z.string().min(1)),
  APP_PASSWORD_HASH: optionalNonEmptyString(z.string().min(1)),
  SESSION_SECRET: optionalNonEmptyString(z.string().min(32)),
  SUPABASE_URL: optionalNonEmptyString(z.string().url()),
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString(z.string().min(1)),
  GEMINI_API_KEY: optionalNonEmptyString(z.string().min(1)),
  LANGFUSE_PUBLIC_KEY: optionalNonEmptyString(z.string().min(1)),
  LANGFUSE_SECRET_KEY: optionalNonEmptyString(z.string().min(1)),
  LANGFUSE_BASE_URL: optionalNonEmptyString(z.string().url()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}

export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getEnv()[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
