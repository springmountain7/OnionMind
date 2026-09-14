import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, sha256 } from "./crypto";

describe("secret encryption", () => {
  it("round trips without storing plaintext", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptSecret("oauth-secret", key);
    expect(encrypted).not.toContain("oauth-secret");
    expect(decryptSecret(encrypted, key)).toBe("oauth-secret");
  });

  it("rejects a wrong key", () => {
    const encrypted = encryptSecret("oauth-secret", randomBytes(32).toString("base64"));
    expect(() => decryptSecret(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });

  it("hashes deterministically", () => {
    expect(sha256("state")).toHaveLength(64);
    expect(sha256("state")).toBe(sha256("state"));
  });
});
