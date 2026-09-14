import { NextResponse } from "next/server";
import { beginOAuthAttempt } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const env = getEnv();
    const state = await beginOAuthAttempt();
    const url = new URL(env.ZHIHU_AUTHORIZE_URL);
    url.searchParams.set("redirect_uri", env.ZHIHU_REDIRECT_URI);
    url.searchParams.set("app_id", env.ZHIHU_APP_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  } catch (error) {
    return jsonError(error);
  }
}
