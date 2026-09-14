import { describe, expect, it } from "vitest";
import { parseDeepSeekStructuredContent } from "./ai";
import { feedbackDataSchema, memoryCardsResponseSchema } from "./validators";

const sourceId = "1ce03eac-2d65-4e92-b762-080142bcc703";
const modelCard = {
  cards: [
    {
      sourceId,
      coreClaim: "测试主张",
      evidence: "单条依据",
      conditions: "单条条件",
      counterpoints: "单条限制",
      question: "下一步要验证什么？",
      keywords: ["测试", "知识"]
    }
  ]
};

describe("DeepSeek structured output compatibility", () => {
  it("normalizes singular string list fields returned by the model", () => {
    const parsed = parseDeepSeekStructuredContent(
      JSON.stringify(modelCard),
      memoryCardsResponseSchema,
      new Set([sourceId])
    );

    expect(parsed.cards[0]).toMatchObject({
      evidence: ["单条依据"],
      conditions: ["单条条件"],
      counterpoints: ["单条限制"]
    });
  });

  it("accepts a single fenced JSON object", () => {
    const parsed = parseDeepSeekStructuredContent(
      `\`\`\`json\n${JSON.stringify(modelCard)}\n\`\`\``,
      memoryCardsResponseSchema,
      new Set([sourceId])
    );

    expect(parsed.cards).toHaveLength(1);
  });

  it("accepts explanatory text around a valid JSON object", () => {
    const parsed = parseDeepSeekStructuredContent(
      `下面是结果：\n${JSON.stringify(modelCard)}\n以上。`,
      memoryCardsResponseSchema,
      new Set([sourceId])
    );

    expect(parsed.cards).toHaveLength(1);
  });

  it("normalizes feedback source prefixes and support labels", () => {
    const parsed = parseDeepSeekStructuredContent(
      JSON.stringify({
        theme: "测试主题",
        observations: [{ text: "测试观察", sourceIds: `note:${sourceId}` }],
        hypotheses: [{ text: "测试假设", support: "强支持", sourceIds: [`card:${sourceId}`] }],
        alternatives: ["其他解释"],
        uncertainties: ["尚不确定"],
        keyQuestion: "下一步验证什么？",
        nextAction: "完成一次测试"
      }),
      feedbackDataSchema,
      new Set([sourceId])
    );

    expect(parsed.observations[0].sourceIds).toEqual([sourceId]);
    expect(parsed.hypotheses[0]).toMatchObject({ support: "强", sourceIds: [sourceId] });
  });

  it("still rejects an invented source id", () => {
    expect(() =>
      parseDeepSeekStructuredContent(JSON.stringify(modelCard), memoryCardsResponseSchema, new Set())
    ).toThrow("unknown sourceId");
  });
});
