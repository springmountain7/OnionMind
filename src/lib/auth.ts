import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, pool } from "@/db";
import type { RowDataPacket } from "mysql2/promise";
import { oauthAttempts, sessions, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/crypto";

export const SESSION_COOKIE = "onionmind_session";
export const OAUTH_NONCE_COOKIE = "onionmind_oauth_nonce";
export const MAX_ACTIVE_SESSIONS = 5;
export const OAUTH_ATTEMPT_TTL_MS = 30 * 60_000;
const MAX_PENDING_OAUTH_ATTEMPTS = 5;

interface OAuthAttemptRow extends RowDataPacket {
  state_hash: string;
  nonce_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

function parseOAuthNonces(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    // Existing deployments stored one raw nonce in this cookie.
  }
  return [value];
}

function encodeOAuthNonces(nonces: string[]) {
  return Buffer.from(JSON.stringify(nonces), "utf8").toString("base64url");
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expires ? { expires } : {})
  };
}

export async function beginOAuthAttempt() {
  const store = await cookies();
  const state = randomToken();
  const nonce = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS);
  await db.insert(oauthAttempts).values({
    stateHash: sha256(state),
    nonceHash: sha256(nonce),
    expiresAt,
    usedAt: null,
    createdAt: now
  });
  const nonces = [...parseOAuthNonces(store.get(OAUTH_NONCE_COOKIE)?.value), nonce].slice(-MAX_PENDING_OAUTH_ATTEMPTS);
  store.set(OAUTH_NONCE_COOKIE, encodeOAuthNonces(nonces), cookieOptions(expiresAt));
  return state;
}

export async function consumeOAuthAttempt(state: string) {
  const store = await cookies();
  const nonces = parseOAuthNonces(store.get(OAUTH_NONCE_COOKIE)?.value);
  if (nonces.length === 0) throw new AppError(400, "OAUTH_ATTEMPT_MISSING", "登录请求已失效，请重新发起知乎登录。");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const nonceHashes = nonces.map(sha256);
    const [rows] = await connection.execute<OAuthAttemptRow[]>(
      `SELECT state_hash, nonce_hash, expires_at, used_at FROM oauth_attempts
       WHERE state_hash = ? AND nonce_hash IN (${nonceHashes.map(() => "?").join(", ")}) FOR UPDATE`,
      [sha256(state), ...nonceHashes]
    );
    const attempt = rows[0];
    if (!attempt || attempt.used_at || new Date(attempt.expires_at).getTime() <= Date.now()) {
      throw new AppError(400, "OAUTH_ATTEMPT_INVALID", "登录请求无效、已使用或已过期，请重新登录。");
    }
    await connection.execute("UPDATE oauth_attempts SET used_at = ? WHERE state_hash = ?", [new Date(), attempt.state_hash]);
    await connection.commit();
    const remainingNonces = nonces.filter((nonce) => sha256(nonce) !== attempt.nonce_hash);
    if (remainingNonces.length > 0) {
      store.set(OAUTH_NONCE_COOKIE, encodeOAuthNonces(remainingNonces), cookieOptions(new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS)));
    } else {
      store.delete(OAUTH_NONCE_COOKIE);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createSession(userId: string) {
  const env = getEnv();
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_DAYS * 24 * 60 * 60_000);
  const tokenHash = sha256(token);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    await connection.execute(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [tokenHash, userId, expiresAt, now]
    );
    await connection.execute(
      `DELETE FROM sessions
       WHERE user_id = ?
         AND token_hash NOT IN (
           SELECT token_hash FROM (
             SELECT token_hash FROM sessions
             WHERE user_id = ? AND expires_at > ?
             ORDER BY created_at DESC, token_hash DESC
             LIMIT ${MAX_ACTIVE_SESSIONS}
           ) AS active_sessions
         )`,
      [userId, userId, now]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AppError(401, "AUTH_REQUIRED", "请先使用知乎账号登录。");
  return user;
}

interface UserCandidateRow extends RowDataPacket {
  id: string;
  created_at: Date;
  data_count: number;
}

interface IdentityUserRow extends RowDataPacket {
  user_id: string;
}

export async function upsertUser(profile: {
  subject: string;
  identities?: string[];
  displayName?: string;
  avatarUrl?: string;
}) {
  const now = new Date();
  const identities = [...new Set([profile.subject, ...(profile.identities ?? [])].map((value) => value.trim()).filter(Boolean))];
  const placeholders = identities.map(() => "?").join(", ");
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `CREATE TABLE IF NOT EXISTS oauth_identities (
         provider VARCHAR(32) NOT NULL,
         provider_account_id VARCHAR(191) NOT NULL,
         user_id CHAR(36) NOT NULL,
         created_at DATETIME NOT NULL,
         updated_at DATETIME NOT NULL,
         PRIMARY KEY (provider, provider_account_id),
         INDEX oauth_identities_user_idx (user_id),
         CONSTRAINT oauth_identities_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await connection.beginTransaction();
    const [identityRows] = await connection.execute<IdentityUserRow[]>(
      `SELECT user_id FROM oauth_identities
       WHERE provider = 'zhihu' AND provider_account_id IN (${placeholders}) FOR UPDATE`,
      identities
    );
    const [legacyRows] = await connection.execute<UserCandidateRow[]>(
      `SELECT u.id, u.created_at,
         ((SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id) +
          (SELECT COUNT(*) FROM note_images i WHERE i.user_id = u.id) +
          (SELECT COUNT(*) FROM zhihu_items z WHERE z.user_id = u.id) +
          (SELECT COUNT(*) FROM memory_cards c WHERE c.user_id = u.id)) AS data_count
       FROM users u WHERE u.zhihu_subject IN (${placeholders}) FOR UPDATE`,
      identities
    );
    const userIds = [...new Set([...identityRows.map((row) => row.user_id), ...legacyRows.map((row) => row.id)])];
    let targetUserId: string;

    if (userIds.length === 0) {
      targetUserId = randomUUID();
      await connection.execute(
        `INSERT INTO users (id, zhihu_subject, display_name, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), avatar_url = VALUES(avatar_url), updated_at = VALUES(updated_at)`,
        [targetUserId, profile.subject, profile.displayName ?? null, profile.avatarUrl ?? null, now, now]
      );
      const [createdRows] = await connection.execute<RowDataPacket[]>("SELECT id FROM users WHERE zhihu_subject = ? FOR UPDATE", [profile.subject]);
      targetUserId = String(createdRows[0]?.id ?? targetUserId);
    } else {
      const candidatesById = new Map(legacyRows.map((row) => [row.id, row]));
      const candidates = userIds.map((id) => candidatesById.get(id) ?? { id, data_count: 0, created_at: now });
      candidates.sort((a, b) => Number(b.data_count) - Number(a.data_count) || +new Date(a.created_at) - +new Date(b.created_at));
      targetUserId = candidates[0].id;
      await connection.execute(
        `UPDATE sessions SET user_id = ? WHERE user_id IN (${userIds.map(() => "?").join(", ")})`,
        [targetUserId, ...userIds]
      );
      await connection.execute(
        "UPDATE users SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
        [profile.displayName ?? null, profile.avatarUrl ?? null, now, targetUserId]
      );
    }

    for (const identity of identities) {
      await connection.execute(
        `INSERT INTO oauth_identities (provider, provider_account_id, user_id, created_at, updated_at)
         VALUES ('zhihu', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = VALUES(updated_at)`,
        [identity, targetUserId, now, now]
      );
    }
    await connection.commit();
    return targetUserId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
