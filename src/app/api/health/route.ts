import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/env";

export async function GET() {
  const env = checkEnv();
  if (!env.ok) return NextResponse.json({ ok: false, database: false, configuration: "incomplete", missing: env.missing }, { status: 503 });
  try {
    const { pool } = await import("@/db");
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: true, configuration: "complete" });
  } catch {
    return NextResponse.json({ ok: false, database: false, configuration: "complete" }, { status: 503 });
  }
}
