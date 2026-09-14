import { NextRequest, NextResponse } from "next/server";
import { callDeepSeekJson, claimGenerationCooldown } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { labReportInputSchema, labReportPrompt, labReportSchema } from "@/lib/lab-report";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = labReportInputSchema.parse(await request.json());
    await claimGenerationCooldown(user.id, "lab");
    const model = getEnv().DEEPSEEK_FEEDBACK_MODEL;
    const report = await callDeepSeekJson({
      userId: user.id,
      kind: "lab",
      model,
      messages: labReportPrompt(input),
      schema: labReportSchema,
      knownSourceIds: new Set()
    });
    return NextResponse.json({ report, model });
  } catch (error) {
    return jsonError(error);
  }
}
