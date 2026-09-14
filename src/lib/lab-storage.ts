export type LabKind = "glimmer" | "energy" | "action";
export type LabStatus = "active" | "paused" | "ended";

export type GlimmerSetup = { defaultSource?: string };
export type EnergySetup = { focusScene?: string };
export type ActionSetup = {
  sourceType: string;
  sourceTitle: string;
  sourceUrl?: string;
  minimumAction: string;
};

export type GlimmerRecord = {
  id: string;
  createdAt: string;
  note: string;
  warmth?: number;
  source?: string;
};
export type EnergyRecord = {
  id: string;
  createdAt: string;
  event: string;
  before: number;
  after: number;
  scene?: string;
  feelings?: string[];
  feeling?: string;
  effect: "charging" | "draining";
};
export type ActionRecord = {
  id: string;
  createdAt: string;
  result: string;
  obstacle?: string;
  nextStatus: "continue" | "adjust" | "finish";
};

export type LabExperiment = {
  id: string;
  kind: LabKind;
  title: string;
  status: LabStatus;
  setup: GlimmerSetup | EnergySetup | ActionSetup;
  records: Array<GlimmerRecord | EnergyRecord | ActionRecord>;
  createdAt: string;
  updatedAt: string;
};

export type LabStore = { version: 1; experiments: LabExperiment[] };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const kinds = new Set<LabKind>(["glimmer", "energy", "action"]);
const statuses = new Set<LabStatus>(["active", "paused", "ended"]);

export function labStorageKey(userId: string) {
  return `onionmind:lab:v1:${encodeURIComponent(userId)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExperiment(value: unknown): value is LabExperiment {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.title !== "string") return false;
  if (!kinds.has(value.kind as LabKind) || !statuses.has(value.status as LabStatus)) return false;
  if (!isObject(value.setup) || !Array.isArray(value.records)) return false;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;
  return value.records.every((record) => {
    if (!isObject(record) || typeof record.id !== "string" || typeof record.createdAt !== "string") return false;
    if (value.kind === "glimmer") return typeof record.note === "string" && (record.warmth === undefined || typeof record.warmth === "number") && (record.source === undefined || typeof record.source === "string");
    if (value.kind === "energy") return typeof record.event === "string" && typeof record.before === "number" && typeof record.after === "number" && (record.feelings === undefined || (Array.isArray(record.feelings) && record.feelings.every((feeling) => typeof feeling === "string"))) && (record.effect === "charging" || record.effect === "draining");
    return typeof record.result === "string" && (record.nextStatus === "continue" || record.nextStatus === "adjust" || record.nextStatus === "finish");
  });
}

export function readLabStore(storage: StorageLike, userId: string): LabStore {
  try {
    const raw = storage.getItem(labStorageKey(userId));
    if (!raw) return { version: 1, experiments: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.experiments)) {
      return { version: 1, experiments: [] };
    }
    return { version: 1, experiments: parsed.experiments.filter(isExperiment) };
  } catch {
    return { version: 1, experiments: [] };
  }
}

export function writeLabStore(storage: StorageLike, userId: string, experiments: LabExperiment[]) {
  storage.setItem(labStorageKey(userId), JSON.stringify({ version: 1, experiments } satisfies LabStore));
}

export function clearLabStore(storage: StorageLike, userId: string) {
  storage.removeItem(labStorageKey(userId));
}

export function updateExperimentStatus(experiments: LabExperiment[], id: string, status: LabStatus, updatedAt = new Date().toISOString()) {
  return experiments.map((experiment) => experiment.id === id ? { ...experiment, status, updatedAt } : experiment);
}

export function validateExperiment(kind: LabKind, title: string, setup: Record<string, string | undefined>) {
  if (!title.trim()) return "请填写实验名称。";
  if (kind === "action") {
    if (!setup.sourceType?.trim()) return "请选择来源类型。";
    if (!setup.sourceTitle?.trim()) return "请填写来源标题。";
    if (!setup.minimumAction?.trim()) return "请填写最小行动。";
    if (setup.sourceUrl?.trim()) {
      try {
        const url = new URL(setup.sourceUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") return "来源链接需以 http:// 或 https:// 开头。";
      } catch {
        return "请填写有效的来源链接。";
      }
    }
  }
  return null;
}

export function validateRecord(kind: LabKind, draft: Record<string, string | number | string[] | undefined>) {
  if (kind === "glimmer") {
    if (!String(draft.note ?? "").trim()) return "请写下一句话记录。";
    const warmth = Number(draft.warmth || 0);
    if (warmth && (warmth < 1 || warmth > 5)) return "幸福温度需在 1–5 之间。";
  }
  if (kind === "energy") {
    if (!String(draft.event ?? "").trim()) return "请填写发生的事件。";
    const before = Number(draft.before);
    const after = Number(draft.after);
    if (![before, after].every((value) => Number.isFinite(value) && value >= 1 && value <= 5)) return "行动前后电量都需在 1–5 之间。";
    if (draft.effect !== "charging" && draft.effect !== "draining") return "请选择充电或耗电。";
  }
  if (kind === "action") {
    if (!String(draft.result ?? "").trim()) return "请填写尝试结果。";
    if (!["continue", "adjust", "finish"].includes(String(draft.nextStatus))) return "请选择本次状态。";
  }
  return null;
}

function common(values: Array<string | undefined>) {
  const counts = values.reduce<Record<string, number>>((result, value) => {
    const key = typeof value === "string" ? value.trim() : "";
    if (key) result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).slice(0, 3);
}

export function summarizeExperiment(experiment: LabExperiment) {
  if (experiment.kind === "glimmer") {
    const records = experiment.records as GlimmerRecord[];
    const temperatures = records.map((record) => record.warmth).filter((value): value is number => typeof value === "number");
    return {
      count: records.length,
      averageWarmth: temperatures.length ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length : null,
      warmthDistribution: [1, 2, 3, 4, 5].map((value) => ({ value, count: temperatures.filter((item) => item === value).length })),
      commonTags: common(records.map((record) => record.source))
    };
  }
  if (experiment.kind === "energy") {
    const records = experiment.records as EnergyRecord[];
    return {
      count: records.length,
      charging: records.filter((record) => record.effect === "charging").length,
      draining: records.filter((record) => record.effect === "draining").length,
      totalChange: records.reduce((sum, record) => sum + record.after - record.before, 0),
      commonScenes: common(records.map((record) => record.scene))
    };
  }
  const records = experiment.records as ActionRecord[];
  const latest = records.at(-1);
  return {
    count: records.length,
    latestStatus: latest?.nextStatus ?? null,
    recentObstacle: [...records].reverse().find((record) => record.obstacle?.trim())?.obstacle ?? null,
    nextDirection: latest?.nextStatus ?? null
  };
}
