import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthAttempt, createSession, upsertUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { jsonError, AppError } from "@/lib/http";
import { exchangeAuthorizationCode, fetchZhihuProfile, saveOAuthAccount } from "@/lib/zhihu";

export async function GET(request: NextRequest) {
  let stage = "validate_callback";
  try {
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("authorization_code") ?? request.nextUrl.searchParams.get("code");
    if (!state) {
      throw new AppError(400, "OAUTH_STATE_MISSING", "知乎回调没有返回 state，已拒绝建立登录会话。");
    }
    if (!code) throw new AppError(400, "OAUTH_CODE_MISSING", "知乎回调没有返回授权码。");
    stage = "consume_oauth_attempt";
    await consumeOAuthAttempt(state);
    stage = "exchange_authorization_code";
    const token = await exchangeAuthorizationCode(code);
    stage = "fetch_profile";
    const profile = await fetchZhihuProfile(token.access_token);
    stage = "resolve_user";
    const userId = await upsertUser(profile);
    stage = "save_oauth_account";
    await saveOAuthAccount(userId, token.access_token, token.expires_in);
    stage = "create_session";
    await createSession(userId);
    return NextResponse.redirect(new URL("/?login=success", getEnv().APP_ORIGIN));
  } catch (error) {
    if (error instanceof AppError) {
      const url = new URL("/", process.env.APP_ORIGIN ?? request.nextUrl.origin);
      url.searchParams.set("loginError", error.code);
      url.searchParams.set("message", error.message);
      return NextResponse.redirect(url);
    }
    const databaseError = error as { code?: unknown; errno?: unknown; sqlState?: unknown };
    console.error("OAuth callback failed", {
      stage,
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof databaseError.code === "string" ? databaseError.code : undefined,
      errno: typeof databaseError.errno === "number" ? databaseError.errno : undefined,
      sqlState: typeof databaseError.sqlState === "string" ? databaseError.sqlState : undefined
    });
    return jsonError(error);
  }
}
