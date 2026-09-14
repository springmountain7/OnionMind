import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "提交的数据格式不正确。" } },
      { status: 400 }
    );
  }
  console.error("Request failed", error instanceof Error ? { name: error.name } : { name: "UnknownError" });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" } },
    { status: 500 }
  );
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
  parseBody: (text: string) => unknown = JSON.parse
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? parseBody(text) : null;
    } catch {
      throw new AppError(502, "UPSTREAM_PROTOCOL_ERROR", "上游服务返回了无法解析的响应。请稍后重试。");
    }
    if (!response.ok) {
      throw new AppError(502, "UPSTREAM_ERROR", `上游服务请求失败（HTTP ${response.status}）。`);
    }
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "UPSTREAM_TIMEOUT", "上游服务响应超时，请稍后重试。");
    }
    throw new AppError(502, "UPSTREAM_UNAVAILABLE", "暂时无法连接上游服务，请稍后重试。");
  } finally {
    clearTimeout(timeout);
  }
}
