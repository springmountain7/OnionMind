import { z } from "zod";

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  ZHIHU_APP_ID: z.string().min(1),
  ZHIHU_APP_KEY: z.string().min(1),
  ZHIHU_ACCESS_SECRET: z.string().min(1),
  ZHIHU_REDIRECT_URI: z.string().url(),
  ZHIHU_AUTHORIZE_URL: z.string().url().default("https://openapi.zhihu.com/authorize"),
  ZHIHU_TOKEN_URL: z.string().url().default("https://openapi.zhihu.com/access_token"),
  ZHIHU_USERINFO_URL: z.string().url().default("https://openapi.zhihu.com/user"),
  ZHIHU_API_BASE_URL: z.string().url().default("https://developer.zhihu.com"),
  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_CARD_MODEL: z.string().min(1).default("deepseek-v4-flash"),
  DEEPSEEK_FEEDBACK_MODEL: z.string().min(1).default("deepseek-v4-flash")
});

export type AppEnv = z.infer<typeof baseSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) {
    cached = baseSchema.parse(process.env);
  }
  return cached;
}

export function checkEnv() {
  const result = baseSchema.safeParse(process.env);
  return result.success
    ? { ok: true as const }
    : {
        ok: false as const,
        missing: result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean)
      };
}
