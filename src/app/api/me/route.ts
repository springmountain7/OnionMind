import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() });
  } catch (error) {
    return jsonError(error);
  }
}
