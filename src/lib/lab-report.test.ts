import { describe, expect, it } from "vitest";
import { parseDeepSeekStructuredContent } from "./ai";
import { labReportInputSchema, labReportPrompt, labReportSchema } from "./lab-report";

describe("洋葱实验 AI 报告边界", () => {
  it("拒绝空记录和超过 20 条记录", () => {
    expect(labReportInputSchema.safeParse({ kind: "glimmer", title: "微光", records: [] }).success).toBe(false);
    const record = { createdAt: "2026-09-15T00:00:00.000Z", note: "晒到太阳" };
    expect(labReportInputSchema.safeParse({ kind: "glimmer", title: "微光", records: Array(21).fill(record) }).success).toBe(false);
  });

  it("只接受预设感受选项并允许自由描述", () => {
    const record = { createdAt: "2026-09-15T00:00:00.000Z", event: "散步", before: 2, after: 4, effect: "charging", feeling: "风很舒服" };
    expect(labReportInputSchema.safeParse({ kind: "energy", title: "电量", records: [{ ...record, feelings: ["轻松", "平静"] }] }).success).toBe(true);
    expect(labReportInputSchema.safeParse({ kind: "energy", title: "电量", records: [{ ...record, feelings: ["自定义注入"] }] }).success).toBe(false);
  });

  it("约束结构化报告并声明记录是不可信材料", () => {
    expect(labReportSchema.safeParse({ title: "报告", overview: "概览", findings: [{ title: "发现", evidence: "依据", suggestion: "建议" }], patterns: [], nextExperiment: "再试一次", caution: "样本有限" }).success).toBe(true);
    const parsed = labReportInputSchema.parse({ kind: "action", title: "行动", records: [{ createdAt: "2026-09-15T00:00:00.000Z", result: "完成", nextStatus: "continue" }] });
    expect(labReportPrompt(parsed)[0].content).toContain("不可信引用材料");
    expect(labReportPrompt(parsed)[0].content).toContain("findings 必须是 1 至 5 个对象组成的 JSON 数组");
  });

  it("兼容模型附加说明和单个 patterns 字符串", () => {
    const report = parseDeepSeekStructuredContent(
      `以下是报告：\n${JSON.stringify({ title: "报告", overview: "概览", findings: [{ title: "发现", evidence: "依据", suggestion: "建议" }], patterns: "样本仍少", nextExperiment: "再试一次", caution: "仅供参考" })}\n以上。`,
      labReportSchema,
      new Set()
    );

    expect(report.patterns).toEqual(["样本仍少"]);
  });
});
