import { describe, expect, it } from "vitest";
import {
  LabExperiment,
  labStorageKey,
  readLabStore,
  summarizeExperiment,
  updateExperimentStatus,
  validateExperiment,
  validateRecord,
  writeLabStore
} from "./lab-storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  };
}

const base = {
  id: "one",
  title: "测试实验",
  status: "active",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z"
} as const;

describe("洋葱实验本机数据", () => {
  it("按 userId 生成不同 key 并隔离读写", () => {
    const storage = memoryStorage();
    const experiment: LabExperiment = { ...base, kind: "glimmer", setup: {}, records: [] };
    writeLabStore(storage, "user/a", [experiment]);
    expect(labStorageKey("user/a")).not.toBe(labStorageKey("user/b"));
    expect(readLabStore(storage, "user/a").experiments).toHaveLength(1);
    expect(readLabStore(storage, "user/b").experiments).toEqual([]);
  });

  it("损坏或旧版本内容安全降级为空", () => {
    const storage = memoryStorage();
    storage.setItem(labStorageKey("user"), "{broken");
    expect(readLabStore(storage, "user").experiments).toEqual([]);
    storage.setItem(labStorageKey("user"), JSON.stringify({ version: 0, experiments: [{}] }));
    expect(readLabStore(storage, "user").experiments).toEqual([]);
    storage.setItem(labStorageKey("user"), JSON.stringify({ version: 1, experiments: [{ ...base, kind: "glimmer", setup: {}, records: [{ broken: true }] }] }));
    expect(readLabStore(storage, "user").experiments).toEqual([]);
  });

  it("只更新目标实验状态", () => {
    const one: LabExperiment = { ...base, kind: "glimmer", setup: {}, records: [] };
    const two: LabExperiment = { ...one, id: "two" };
    const updated = updateExperimentStatus([one, two], "one", "paused", "later");
    expect(updated[0]).toMatchObject({ status: "paused", updatedAt: "later" });
    expect(updated[1]).toEqual(two);
  });
});

describe("创建与记录验证", () => {
  it.each(["glimmer", "energy", "action"] as const)("%s 拒绝空实验名", (kind) => {
    expect(validateExperiment(kind, "", {})).toBeTruthy();
  });

  it("行动实验要求来源与最小行动并验证链接", () => {
    expect(validateExperiment("action", "行动", {})).toBeTruthy();
    expect(validateExperiment("action", "行动", { sourceType: "手动", sourceTitle: "文章", minimumAction: "走五分钟", sourceUrl: "bad" })).toBeTruthy();
    expect(validateExperiment("action", "行动", { sourceType: "手动", sourceTitle: "文章", minimumAction: "走五分钟", sourceUrl: "https://example.com" })).toBeNull();
  });

  it("三个玩法都拒绝缺少必填项的记录", () => {
    expect(validateRecord("glimmer", {})).toBeTruthy();
    expect(validateRecord("energy", { event: "散步", before: 0, after: 6, effect: "charging" })).toBeTruthy();
    expect(validateRecord("action", { result: "" })).toBeTruthy();
  });
});

describe("基础总结", () => {
  it("微光总结只统计真实记录", () => {
    const experiment: LabExperiment = { ...base, kind: "glimmer", setup: {}, records: [
      { id: "r1", createdAt: base.createdAt, note: "阳光", warmth: 4, source: "散步" },
      { id: "r2", createdAt: base.createdAt, note: "晚风", warmth: 2, source: "散步" }
    ] };
    expect(summarizeExperiment(experiment)).toMatchObject({ count: 2, averageWarmth: 3, commonTags: [["散步", 2]] });
  });

  it("电量总结使用用户选择和前后差值", () => {
    const experiment: LabExperiment = { ...base, kind: "energy", setup: {}, records: [
      { id: "r1", createdAt: base.createdAt, event: "会议", before: 4, after: 2, effect: "draining" }
    ] };
    expect(summarizeExperiment(experiment)).toMatchObject({ count: 1, charging: 0, draining: 1, totalChange: -2 });
  });

  it("行动总结取最新状态和最近阻碍", () => {
    const experiment: LabExperiment = { ...base, kind: "action", setup: { sourceType: "手动", sourceTitle: "文章", minimumAction: "一步" }, records: [
      { id: "r1", createdAt: base.createdAt, result: "试过", obstacle: "时间不足", nextStatus: "adjust" }
    ] };
    expect(summarizeExperiment(experiment)).toMatchObject({ count: 1, latestStatus: "adjust", recentObstacle: "时间不足", nextDirection: "adjust" });
  });
});
