import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_PUBSUB_TOPIC: z.string().min(1),
  GOOGLE_PUBSUB_VERIFY_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  FRONTEND_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
      process.exit(1);
    }
    _env = parsed.data;
  }
  return _env;
}
