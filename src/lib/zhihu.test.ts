import { describe, expect, it } from "vitest";
import { AppError } from "./http";
import {
  extractAccessToken,
  extractZhihuProfile,
  normalizeZhihuCollections,
  parseZhihuProfilePayload,
  zhihuProfileHeaders
} from "./zhihu";

describe("Zhihu protocol parsing", () => {
  it("accepts top-level and nested token responses", () => {
    expect(extractAccessToken({ access_token: "one", expires_in: 3600 }).access_token).toBe("one");
    expect(extractAccessToken({ data: { access_token: "two", expires_in: "7200" } }).expires_in).toBe(7200);
  });

  it("requires a stable profile identifier", () => {
    expect(extractZhihuProfile({ data: { url_token: "stable-user", name: "测试用户" } })).toEqual({
      subject: "stable-user",
      identities: ["stable-user"],
      displayName: "测试用户",
      avatarUrl: undefined
    });
    expect(() => extractZhihuProfile({ data: { name: "只有昵称" } })).toThrow(AppError);
  });

  it("accepts successful user responses with documented business codes and casing", () => {
    expect(
      extractZhihuProfile({ code: 20000, data: { User: { ID: 42, Fullname: "测试用户", AvatarUrl: "https://example.com/a.png" } } })
    ).toEqual({
      subject: "42",
      identities: ["42"],
      displayName: "测试用户",
      avatarUrl: "https://example.com/a.png"
    });
  });

  it("uses the OAuth token directly for the hackathon user profile endpoint", () => {
    expect(zhihuProfileHeaders("oauth-token")).toEqual({
      Authorization: "Bearer oauth-token",
      "Content-Type": "application/json"
    });
    expect(zhihuProfileHeaders("oauth-token")).not.toHaveProperty("X-OAuth-Token");
    expect(zhihuProfileHeaders("oauth-token")).not.toHaveProperty("X-Request-Timestamp");
  });

  it("preserves int64 uid values and supports the documented profile fields", () => {
    const payload = parseZhihuProfilePayload(
      '{"uid":969570047710216200,"hash_id":"stable-hash","fullname":"测试用户","avatar_path":"https://example.com/a.png"}'
    );
    expect((payload as { uid: unknown }).uid).toBe("969570047710216200");
    expect(extractZhihuProfile(payload)).toEqual({
      subject: "969570047710216200",
      identities: ["969570047710216200", "stable-hash"],
      displayName: "测试用户",
      avatarUrl: "https://example.com/a.png"
    });
  });

  it("keeps the pre-existing uid identity when the response also includes hash_id", () => {
    expect(extractZhihuProfile({ uid: "123456", hash_id: "new-alias" })).toMatchObject({
      subject: "123456",
      identities: ["123456", "new-alias"]
    });
  });

  it("reports HTTP 200 business errors instead of misclassifying them as missing identities", () => {
    expect(() => extractZhihuProfile({ code: 20004, data: "Token type is error" })).toThrow(
      expect.objectContaining({ code: "ZHIHU_TOKEN_TYPE_ERROR", status: 401 })
    );
    expect(() => extractZhihuProfile({ code: 20005, data: "Access token is not valid" })).toThrow(
      expect.objectContaining({ code: "ZHIHU_REAUTHORIZE", status: 401 })
    );
    expect(() => extractZhihuProfile({ Code: 30001, Message: "rate limited" })).toThrow(
      expect.objectContaining({ code: "ZHIHU_RATE_LIMITED", status: 429 })
    );
  });

  it("normalizes recent favorites and limits the result", () => {
    const payload = {
      Code: 0,
      Data: {
        Items: Array.from({ length: 55 }, (_, index) => ({
          Url: `https://www.zhihu.com/question/${index}`,
          ContentType: "answer",
          Title: `标题 ${index}`,
          Summary: `摘要 ${index}`,
          FavTime: 1_700_000_000,
          Author: { Name: "作者" }
        }))
      }
    };
    const items = normalizeZhihuCollections(payload);
    expect(items).toHaveLength(50);
    expect(items[0]).toMatchObject({ title: "标题 0", authorName: "作者", contentType: "answer" });
  });

  it("maps authorization and rate limit failures", () => {
    expect(() => normalizeZhihuCollections({ Code: 20001, Data: {} })).toThrow("重新登录");
    expect(() => normalizeZhihuCollections({ Code: 30001, Data: {} })).toThrow("限流");
  });
});
