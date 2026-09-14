import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { oauthAccounts } from "@/db/schema";
import { decryptSecret, encryptSecret, sha256 } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { AppError, fetchJson } from "@/lib/http";

const tokenPayloadSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.coerce.number().positive().optional()
  })
  .passthrough();

export type ZhihuProfile = {
  subject: string;
  identities: string[];
  displayName?: string;
  avatarUrl?: string;
};

const profileIdentityKeys = [
  "uid",
  "UID",
  "user_id",
  "userId",
  "UserId",
  "hash_id",
  "hashId",
  "HashId",
  "id",
  "ID",
  "Id",
  "url_token",
  "urlToken",
  "UrlToken"
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function findRecord(value: unknown, keys: string[]) {
  let current = asRecord(value);
  for (const key of keys) {
    current = asRecord(current?.[key]);
  }
  return current;
}

function firstString(record: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function businessCode(payload: unknown) {
  const root = asRecord(payload);
  const value = root?.code ?? root?.Code;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function assertZhihuUserResponse(payload: unknown) {
  const code = businessCode(payload);
  if (code === undefined || code === 0 || code === 20000) return;
  if (code === 20001) {
    throw new AppError(401, "ZHIHU_REAUTHORIZE", "知乎授权无效或已过期，请重新登录授权。");
  }
  if (code === 20004) {
    throw new AppError(401, "ZHIHU_TOKEN_TYPE_ERROR", "知乎用户令牌类型不正确，请检查 OAuth 凭证配置后重新授权。");
  }
  if (code === 20005) {
    throw new AppError(401, "ZHIHU_REAUTHORIZE", "知乎 OAuth 访问令牌无效，请重新登录授权。");
  }
  if (code === 30001 || code === 30002) {
    throw new AppError(429, "ZHIHU_RATE_LIMITED", "知乎用户接口已限流或额度不足，请稍后重试。");
  }
  throw new AppError(502, "ZHIHU_USERINFO_ERROR", `知乎用户接口返回业务错误（${code}）。`);
}

export function extractAccessToken(payload: unknown) {
  const candidates = [asRecord(payload), findRecord(payload, ["data"]), findRecord(payload, ["Data"])];
  for (const candidate of candidates) {
    const parsed = tokenPayloadSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  throw new AppError(502, "ZHIHU_TOKEN_PROTOCOL_ERROR", "知乎没有返回可用的 OAuth access token。");
}

export function extractZhihuProfile(payload: unknown): ZhihuProfile {
  assertZhihuUserResponse(payload);
  const candidates = [
    asRecord(payload),
    findRecord(payload, ["data"]),
    findRecord(payload, ["Data"]),
    findRecord(payload, ["user"]),
    findRecord(payload, ["User"]),
    findRecord(payload, ["data", "user"]),
    findRecord(payload, ["data", "User"]),
    findRecord(payload, ["Data", "user"]),
    findRecord(payload, ["Data", "User"])
  ];
  for (const candidate of candidates) {
    const identities = [...new Set(profileIdentityKeys.map((key) => firstString(candidate, [key])).filter(Boolean))] as string[];
    const subject = identities[0];
    if (!subject) continue;
    return {
      subject,
      identities,
      displayName: firstString(candidate, ["name", "Name", "fullname", "full_name", "Fullname"]),
      avatarUrl: firstString(candidate, ["avatar_path", "avatar_url", "avatarUrl", "AvatarUrl"])
    };
  }
  throw new AppError(
    502,
    "ZHIHU_STABLE_ID_MISSING",
    "知乎用户接口没有返回稳定账号标识，已停止登录，不能使用昵称代替用户 ID。"
  );
}

export function parseZhihuProfilePayload(text: string) {
  type ReviverContext = { source?: string };
  type ReviverWithContext = (this: unknown, key: string, value: unknown, context?: ReviverContext) => unknown;
  const parseWithContext = JSON.parse as (value: string, reviver: ReviverWithContext) => unknown;
  return parseWithContext(text, (key, value, context) => {
    if (["uid", "UID", "user_id", "userId", "UserId"].includes(key) && typeof value === "number" && context?.source) {
      return context.source;
    }
    return value;
  });
}

export async function exchangeAuthorizationCode(code: string) {
  const env = getEnv();
  const body = new URLSearchParams({
    app_id: env.ZHIHU_APP_ID,
    app_key: env.ZHIHU_APP_KEY,
    grant_type: "authorization_code",
    redirect_uri: env.ZHIHU_REDIRECT_URI,
    code
  });
  const payload = await fetchJson(env.ZHIHU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  return extractAccessToken(payload);
}

function zhihuHeaders(oauthToken: string) {
  const env = getEnv();
  return {
    Authorization: `Bearer ${env.ZHIHU_ACCESS_SECRET}`,
    "X-OAuth-Token": oauthToken,
    "X-Request-Timestamp": Math.floor(Date.now() / 1000).toString(),
    "Content-Type": "application/json"
  };
}

export function zhihuProfileHeaders(oauthToken: string) {
  return {
    Authorization: `Bearer ${oauthToken}`,
    "Content-Type": "application/json"
  };
}

export async function fetchZhihuProfile(oauthToken: string) {
  const env = getEnv();
  const payload = await fetchJson(
    env.ZHIHU_USERINFO_URL,
    { headers: zhihuProfileHeaders(oauthToken) },
    15_000,
    parseZhihuProfilePayload
  );
  return extractZhihuProfile(payload);
}

export async function saveOAuthAccount(userId: string, token: string, expiresIn?: number) {
  const env = getEnv();
  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;
  const accessTokenCipher = encryptSecret(token, env.TOKEN_ENCRYPTION_KEY);
  await db
    .insert(oauthAccounts)
    .values({ userId, accessTokenCipher, expiresAt, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { accessTokenCipher, expiresAt, updatedAt: now } });
}

export async function getOAuthToken(userId: string) {
  const rows = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId)).limit(1);
  const account = rows[0];
  if (!account) throw new AppError(401, "ZHIHU_REAUTHORIZE", "知乎授权不存在，请重新登录授权。");
  if (account.expiresAt && account.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "ZHIHU_TOKEN_EXPIRED", "知乎授权已过期，请重新登录授权。");
  }
  return decryptSecret(account.accessTokenCipher, getEnv().TOKEN_ENCRYPTION_KEY);
}

const normalizedItemSchema = z.object({
  id: z.string().uuid(),
  sourceHash: z.string().length(64),
  sourceUrl: z.string().url(),
  contentType: z.string().max(32),
  title: z.string().max(500),
  summary: z.string(),
  authorName: z.string().max(191).nullable(),
  favoriteAt: z.date().nullable()
});

export type NormalizedZhihuItem = z.infer<typeof normalizedItemSchema>;

export function normalizeZhihuCollections(payload: unknown): NormalizedZhihuItem[] {
  const root = asRecord(payload);
  const code = root?.Code ?? root?.code;
  if (code !== undefined && code !== 0 && code !== 20000) {
    if (code === 20001) throw new AppError(401, "ZHIHU_REAUTHORIZE", "知乎授权无效，请重新登录。");
    if (code === 30001 || code === 30002) throw new AppError(429, "ZHIHU_RATE_LIMITED", "知乎接口已限流或额度不足。");
    throw new AppError(502, "ZHIHU_API_ERROR", "知乎收藏接口返回业务错误。");
  }
  const data = asRecord(root?.Data ?? root?.data) ?? root;
  const rawItems = data?.Items ?? data?.items;
  if (!Array.isArray(rawItems)) {
    throw new AppError(502, "ZHIHU_PROTOCOL_ERROR", "知乎收藏接口没有返回预期的数据列表。");
  }
  return rawItems.slice(0, 50).map((raw) => {
    const item = asRecord(raw) ?? {};
    const author = asRecord(item.Author ?? item.author);
    const sourceUrl = firstString(item, ["Url", "url"]);
    if (!sourceUrl || !sourceUrl.startsWith("https://")) {
      throw new AppError(502, "ZHIHU_PROTOCOL_ERROR", "知乎收藏包含无效来源链接。");
    }
    const favoriteSeconds = Number(item.FavTime ?? item.fav_time ?? item.favorite_at);
    return normalizedItemSchema.parse({
      id: randomUUID(),
      sourceHash: sha256(sourceUrl),
      sourceUrl,
      contentType: firstString(item, ["ContentType", "content_type", "type"]) ?? "unknown",
      title: (firstString(item, ["Title", "title"]) ?? "未命名收藏").slice(0, 500),
      summary: firstString(item, ["Summary", "summary", "excerpt"]) ?? "",
      authorName: firstString(author, ["Name", "name", "Fullname"])?.slice(0, 191) ?? null,
      favoriteAt: Number.isFinite(favoriteSeconds) && favoriteSeconds > 0 ? new Date(favoriteSeconds * 1000) : null
    });
  });
}

export async function fetchRecentCollections(userId: string) {
  const env = getEnv();
  const token = await getOAuthToken(userId);
  const url = new URL("/api/v1/user/collections", env.ZHIHU_API_BASE_URL);
  url.searchParams.set("Limit", "50");
  const payload = await fetchJson(url.toString(), { headers: zhihuHeaders(token) });
  return normalizeZhihuCollections(payload);
}
