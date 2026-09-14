import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  cookieJar: new Map<string, string>(),
  deleteCookie: vi.fn(),
  execute: vi.fn(),
  insertValues: vi.fn(),
  release: vi.fn(),
  rollback: vi.fn(),
  setCookie: vi.fn()
}));

vi.mock("@/db", () => ({
  db: { insert: vi.fn(() => ({ values: mocks.insertValues })) },
  pool: {
    getConnection: vi.fn(async () => ({
      beginTransaction: mocks.beginTransaction,
      commit: mocks.commit,
      execute: mocks.execute,
      release: mocks.release,
      rollback: mocks.rollback
    }))
  }
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (mocks.cookieJar.has(name) ? { value: mocks.cookieJar.get(name) } : undefined),
    delete: mocks.deleteCookie,
    set: mocks.setCookie
  }))
}));

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({ SESSION_TTL_DAYS: 30 }))
}));

import { sha256 } from "./crypto";
import {
  beginOAuthAttempt,
  consumeOAuthAttempt,
  createSession,
  MAX_ACTIVE_SESSIONS,
  OAUTH_ATTEMPT_TTL_MS,
  OAUTH_NONCE_COOKIE
} from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieJar.clear();
  mocks.setCookie.mockImplementation((name: string, value: string) => mocks.cookieJar.set(name, value));
  mocks.deleteCookie.mockImplementation((name: string) => mocks.cookieJar.delete(name));
});

describe("OAuth attempts", () => {
  it("keeps recent parallel attempts and consumes only the matching nonce", async () => {
    const firstState = await beginOAuthAttempt();
    await beginOAuthAttempt();
    const encoded = mocks.cookieJar.get(OAUTH_NONCE_COOKIE)!;
    const nonces = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as string[];
    expect(nonces).toHaveLength(2);
    expect(OAUTH_ATTEMPT_TTL_MS).toBe(30 * 60_000);

    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT state_hash")) {
        return [[{ state_hash: sha256(firstState), nonce_hash: sha256(nonces[0]), expires_at: new Date(Date.now() + 60_000), used_at: null }], []];
      }
      return [[], []];
    });
    await consumeOAuthAttempt(firstState);

    const remaining = JSON.parse(Buffer.from(mocks.cookieJar.get(OAUTH_NONCE_COOKIE)!, "base64url").toString("utf8"));
    expect(remaining).toEqual([nonces[1]]);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });
});

describe("session limit", () => {

  it("keeps at most five active browser sessions after login", async () => {
    await createSession("user-1");

    expect(MAX_ACTIVE_SESSIONS).toBe(5);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("LIMIT 5"), ["user-1", "user-1", expect.any(Date)]);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.setCookie).toHaveBeenCalledOnce();
  });
});
