"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ActionRecord,
  EnergyRecord,
  GlimmerRecord,
  LabExperiment,
  LabKind,
  LabStatus,
  readLabStore,
  summarizeExperiment,
  updateExperimentStatus,
  validateExperiment,
  validateRecord,
  writeLabStore
} from "@/lib/lab-storage";
import type { LabReport } from "@/lib/lab-report";

type SourceOption = { type: "知乎收藏" | "认知反馈"; title: string; url?: string };
type View = { name: "home" } | { name: "create"; kind: LabKind } | { name: "detail" | "record" | "summary" | "ai" | "draft"; id: string };

const modes: Array<{ kind?: LabKind; icon: string; title: string; copy: string; open: boolean }> = [
  { kind: "glimmer", icon: "✦", title: "微光收集中", copy: "收下那些很小、但确实让你舒服了一点的瞬间。", open: true },
  { kind: "energy", icon: "◒", title: "电量侦测中", copy: "观察什么在充电、什么在耗电，不给自己打分。", open: true },
  { kind: "action", icon: "↗", title: "行动发芽中", copy: "从一个道理里拆出今天真的能试的一小步。", open: true },
  { icon: "◇", title: "勇气加载中", copy: "把日常、安全、可退回的小尝试，慢慢放进生活。", open: false },
  { icon: "≈", title: "想法更新中", copy: "补充条件与证据，记录认识怎样变化，而不是判旧观点输赢。", open: false }
];

const kindName: Record<LabKind, string> = { glimmer: "微光收集中", energy: "电量侦测中", action: "行动发芽中" };
const statusName: Record<LabStatus, string> = { active: "进行中", paused: "暂停", ended: "已结束" };
const actionStatusName = { continue: "继续", adjust: "调整", finish: "结束" } as const;
const feelingOptions = ["轻松", "平静", "专注", "愉快", "疲惫", "焦虑", "烦躁"] as const;

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export function LabPanel({ userId, sourceOptions = [] }: { userId: string; sourceOptions?: SourceOption[] }) {
  const [experiments, setExperiments] = useState<LabExperiment[]>([]);
  const [view, setView] = useState<View>({ name: "home" });
  const [error, setError] = useState("");
  const [loadedUserId, setLoadedUserId] = useState("");
  const [draft, setDraft] = useState("");
  const current = view.name === "home" || view.name === "create" ? null : experiments.find((item) => item.id === view.id) ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setExperiments(readLabStore(window.localStorage, userId).experiments);
      setLoadedUserId(userId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    if (loadedUserId === userId) writeLabStore(window.localStorage, userId, experiments);
  }, [experiments, loadedUserId, userId]);

  const mainExperiment = useMemo(
    () => experiments.find((item) => item.status === "active") ?? experiments.find((item) => item.status === "paused") ?? experiments[0],
    [experiments]
  );

  function go(next: View) {
    setError("");
    setView(next);
  }

  function createExperiment(kind: LabKind, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = text(form, "title");
    const setup = kind === "glimmer"
      ? { defaultSource: text(form, "defaultSource") }
      : kind === "energy"
        ? { focusScene: text(form, "focusScene") }
        : {
            sourceType: text(form, "sourceType"),
            sourceTitle: text(form, "sourceTitle"),
            sourceUrl: text(form, "sourceUrl"),
            minimumAction: text(form, "minimumAction")
          };
    const message = validateExperiment(kind, title, setup);
    if (message) return setError(message);
    const now = new Date().toISOString();
    const experiment: LabExperiment = { id: makeId(), kind, title, status: "active", setup, records: [], createdAt: now, updatedAt: now };
    setExperiments((items) => [experiment, ...items]);
    go({ name: "detail", id: experiment.id });
  }

  function addRecord(experiment: LabExperiment, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const record = experiment.kind === "glimmer"
      ? { id: makeId(), createdAt: now, note: text(form, "note"), warmth: Number(form.get("warmth")) || undefined, source: text(form, "source") } satisfies GlimmerRecord
      : experiment.kind === "energy"
        ? { id: makeId(), createdAt: now, event: text(form, "event"), before: Number(form.get("before")), after: Number(form.get("after")), scene: text(form, "scene"), feelings: form.getAll("feelings").map(String), feeling: text(form, "feeling"), effect: text(form, "effect") as EnergyRecord["effect"] } satisfies EnergyRecord
        : { id: makeId(), createdAt: now, result: text(form, "result"), obstacle: text(form, "obstacle"), nextStatus: text(form, "nextStatus") as ActionRecord["nextStatus"] } satisfies ActionRecord;
    const message = validateRecord(experiment.kind, record);
    if (message) return setError(message);
    setExperiments((items) => items.map((item) => item.id === experiment.id ? { ...item, records: [...item.records, record], updatedAt: now } : item));
    go({ name: "detail", id: experiment.id });
  }

  function updateStatus(id: string, status: LabStatus) {
    setExperiments((items) => updateExperimentStatus(items, id, status));
  }

  function selectSource(event: React.ChangeEvent<HTMLSelectElement>) {
    if (!event.target.value) return;
    const option = sourceOptions[Number(event.target.value)];
    const form = event.target.form;
    if (!option || !form) return;
    const sourceType = form.elements.namedItem("sourceType") as HTMLSelectElement | null;
    const sourceTitle = form.elements.namedItem("sourceTitle") as HTMLInputElement | null;
    const sourceUrl = form.elements.namedItem("sourceUrl") as HTMLInputElement | null;
    if (sourceType) sourceType.value = option.type;
    if (sourceTitle) sourceTitle.value = option.title;
    if (sourceUrl) sourceUrl.value = option.url ?? "";
  }

  return <div className="lab-page">
    <header className="lab-heading">
      <div><span>ONION LAB · 05</span><h1>洋葱实验</h1><p>把收藏夹里的道理，拿到生活里试试看。</p></div>
    </header>

    {view.name !== "home" && <button type="button" className="lab-back" onClick={() => go({ name: "home" })}>← 返回实验首页</button>}
    {error && <p className="lab-error" role="alert">{error}</p>}

    {view.name === "home" && <LabHome mainExperiment={mainExperiment} experiments={experiments} go={go} />}
    {view.name === "create" && <CreateForm kind={view.kind} sourceOptions={sourceOptions} onSourceChange={selectSource} onSubmit={(event) => createExperiment(view.kind, event)} />}
    {view.name === "detail" && current && <ExperimentDetail experiment={current} go={go} updateStatus={updateStatus} />}
    {view.name === "record" && current && <RecordForm experiment={current} onSubmit={(event) => addRecord(current, event)} />}
    {view.name === "summary" && current && <Summary experiment={current} />}
    {view.name === "ai" && current && <AiConfirm experiment={current} go={go} />}
    {view.name === "draft" && current && <DraftArea experiment={current} value={draft} setValue={setDraft} />}
    {view.name !== "home" && view.name !== "create" && !current && <section className="lab-card"><h2>没有找到这个实验</h2><p>它可能已从本机演示数据中清除。</p></section>}
  </div>;
}

function LabHome({ mainExperiment, experiments, go }: { mainExperiment?: LabExperiment; experiments: LabExperiment[]; go: (view: View) => void }) {
  return <>
    <section className="lab-main-card">
      {mainExperiment ? <>
        <div className="lab-card-meta"><span>{kindName[mainExperiment.kind]}</span><b>{statusName[mainExperiment.status]}</b></div>
        <h2>{mainExperiment.title}</h2>
        <p>已经留下 {mainExperiment.records.length} 次真实记录。下一次观察，什么时候发生都算数。</p>
        <button type="button" className="lab-primary" onClick={() => go({ name: "record", id: mainExperiment.id })}>＋ 记下这一次</button>
        <button type="button" className="lab-link" onClick={() => go({ name: "detail", id: mainExperiment.id })}>查看实验与记录 →</button>
      </> : <>
        <h2>还没有实验，先挑一个顺眼的玩法</h2>
        <p>不用连续签到，也没有排名。只记录你亲自试过的东西。</p>
        <button type="button" className="lab-primary" onClick={() => go({ name: "create", kind: "glimmer" })}>从微光收集开始</button>
      </>}
    </section>

    <section className="lab-section">
      <div className="lab-section-title"><div><span>CHOOSE A MODE</span><h2>五种玩法</h2></div><small>3 种可用 · 2 种后续开放</small></div>
      <div className="lab-mode-grid">{modes.map((mode) => <article className={`lab-mode-card${mode.open ? "" : " is-locked"}`} key={mode.title}>
        <span className="lab-mode-icon">{mode.icon}</span><div><h3>{mode.title}</h3><p>{mode.copy}</p></div>
        {mode.open && mode.kind ? <button type="button" onClick={() => go({ name: "create", kind: mode.kind! })}>创建实验</button> : <b>后续开放</b>}
      </article>)}</div>
    </section>

    <section className="lab-section lab-recent">
      <div className="lab-section-title"><div><span>RECENT</span><h2>最近发现与基础总结</h2></div></div>
      {experiments.length ? <div className="lab-list">{experiments.slice(0, 4).map((experiment) => <button type="button" key={experiment.id} onClick={() => go({ name: "summary", id: experiment.id })}>
        <span>{kindName[experiment.kind]} · {statusName[experiment.status]}</span><strong>{experiment.title}</strong><small>{experiment.records.length} 次记录，查看基于真实记录的总结 →</small>
      </button>)}</div> : <p className="lab-empty-copy">完成第一条记录后，这里才会出现属于你的发现。不会预置虚构报告。</p>}
    </section>
  </>;
}

function CreateForm({ kind, sourceOptions, onSourceChange, onSubmit }: { kind: LabKind; sourceOptions: SourceOption[]; onSourceChange: (event: React.ChangeEvent<HTMLSelectElement>) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="lab-form lab-card" onSubmit={onSubmit}>
    <span className="lab-kicker">CREATE · {kindName[kind]}</span><h2>创建一个轻量实验</h2>
    <label>实验名称<input name="title" maxLength={80} placeholder={kind === "glimmer" ? "例如：收集下班路上的小亮点" : kind === "energy" ? "例如：找出我的午后电量开关" : "例如：把一个收藏变成七天小行动"} /></label>
    {kind === "glimmer" && <label>默认来源标签 <small>可选</small><input name="defaultSource" maxLength={40} placeholder="例如：散步、朋友、独处" /></label>}
    {kind === "energy" && <label>关注场景 <small>可选</small><input name="focusScene" maxLength={60} placeholder="例如：会议后、通勤、午休" /></label>}
    {kind === "action" && <>
      {sourceOptions.length > 0 && <label>从已加载内容选择 <small>可选，也可手动填写</small><select defaultValue="" onChange={onSourceChange}><option value="">选择一条收藏或认知反馈</option>{sourceOptions.map((option, index) => <option key={`${option.type}-${index}`} value={index}>{option.type} · {option.title}</option>)}</select></label>}
      <label>来源类型<select name="sourceType" defaultValue=""><option value="">请选择</option><option value="知乎收藏">知乎收藏</option><option value="认知反馈">认知反馈</option><option value="书籍或文章">书籍或文章</option><option value="自己的想法">自己的想法</option><option value="其他">其他</option></select></label>
      <label>来源标题<input name="sourceTitle" maxLength={160} placeholder="这条道理来自哪里？" /></label>
      <label>来源链接 <small>可选</small><input name="sourceUrl" type="url" placeholder="https://" /></label>
      <label>最小行动<textarea name="minimumAction" maxLength={500} placeholder="小到今天愿意试一次，例如：晚饭后走 8 分钟。" /></label>
      <p className="lab-inline-note">创建行动不等于完成行动。</p>
    </>}
    <p className="lab-storage-note">实验数据仅保存在此浏览器，不会同步到账号或云端。</p>
    <div className="lab-form-actions"><button type="submit" className="lab-primary">保存实验</button></div>
  </form>;
}

function ExperimentDetail({ experiment, go, updateStatus }: { experiment: LabExperiment; go: (view: View) => void; updateStatus: (id: string, status: LabStatus) => void }) {
  return <>
    <section className="lab-card lab-detail-head">
      <div className="lab-card-meta"><span>{kindName[experiment.kind]}</span><b>{statusName[experiment.status]}</b></div><h2>{experiment.title}</h2>
      {experiment.kind === "glimmer" && <p>微光值只代表记录行为或次数，不是科学幸福指数，也不会因为中断记录而扣除。</p>}
      {experiment.kind === "energy" && <p>耗电不等于失败，它只是一次观察。</p>}
      {experiment.kind === "action" && <p>创建行动不等于完成行动。最小行动：{String((experiment.setup as { minimumAction: string }).minimumAction)}</p>}
      <div className="lab-status-row"><span>实验状态</span>{(["active", "paused", "ended"] as LabStatus[]).map((status) => <button type="button" className={experiment.status === status ? "active" : ""} key={status} onClick={() => updateStatus(experiment.id, status)}>{statusName[status]}</button>)}</div>
      <div className="lab-actions"><button type="button" className="lab-primary" onClick={() => go({ name: "record", id: experiment.id })}>＋ 新增记录</button><button type="button" onClick={() => go({ name: "summary", id: experiment.id })}>查看基础总结</button></div>
    </section>
    <section className="lab-section"><div className="lab-section-title"><div><span>RECORDS</span><h2>记录列表</h2></div><small>{experiment.records.length} 次</small></div>
      {experiment.records.length ? <div className="lab-record-list">{[...experiment.records].reverse().map((record) => <RecordCard key={record.id} experiment={experiment} record={record} />)}</div> : <p className="lab-empty-copy">还没有记录。等生活里真的发生一次，再回来写。</p>}
    </section>
    <section className="lab-card lab-future"><h3>把记录整理成发现</h3><p>只有你主动选择并确认后，才会把本次选定记录交给 DeepSeek 生成实验报告。</p><div className="lab-actions"><button type="button" onClick={() => go({ name: "ai", id: experiment.id })}>生成 AI 实验报告</button><button type="button" onClick={() => go({ name: "draft", id: experiment.id })}>生成可编辑草稿</button></div><small>不自动发送、不自动发布，AI 报告仅供参考。</small></section>
  </>;
}

function RecordCard({ experiment, record }: { experiment: LabExperiment; record: GlimmerRecord | EnergyRecord | ActionRecord }) {
  return <article className="lab-card lab-record">
    <time>{new Date(record.createdAt).toLocaleString("zh-CN")}</time>
    {experiment.kind === "glimmer" && <><h3>{(record as GlimmerRecord).note}</h3><p>幸福温度：{(record as GlimmerRecord).warmth ? `${(record as GlimmerRecord).warmth}/5` : "未填写"} · 来源：{(record as GlimmerRecord).source || "未填写"}</p></>}
    {experiment.kind === "energy" && <><h3>{(record as EnergyRecord).event}</h3><p>电量 {(record as EnergyRecord).before} → {(record as EnergyRecord).after} · {(record as EnergyRecord).effect === "charging" ? "充电" : "耗电"} · 场景：{(record as EnergyRecord).scene || "未填写"}</p>{Boolean((record as EnergyRecord).feelings?.length || (record as EnergyRecord).feeling) && <blockquote>{[(record as EnergyRecord).feelings?.join("、"), (record as EnergyRecord).feeling].filter(Boolean).join(" · ")}</blockquote>}</>}
    {experiment.kind === "action" && <><h3>{(record as ActionRecord).result}</h3><p>本次状态：{actionStatusName[(record as ActionRecord).nextStatus]} · 阻碍：{(record as ActionRecord).obstacle || "未填写"}</p></>}
  </article>;
}

function RecordForm({ experiment, onSubmit }: { experiment: LabExperiment; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const defaultSource = experiment.kind === "glimmer" ? String((experiment.setup as { defaultSource?: string }).defaultSource ?? "") : "";
  return <form className="lab-form lab-card" onSubmit={onSubmit}>
    <span className="lab-kicker">RECORD · {kindName[experiment.kind]}</span><h2>记下这一次</h2><p>{experiment.title}</p>
    {experiment.kind === "glimmer" && <><label>一句话记录<textarea name="note" maxLength={500} placeholder="刚才有什么小瞬间，让你舒服了一点？" /></label><label>幸福温度 <small>可选，1–5 只是主观感受</small><select name="warmth" defaultValue=""><option value="">不填写</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>来源标签 <small>可选</small><input name="source" defaultValue={defaultSource} maxLength={40} /></label><p className="lab-inline-note">微光值只代表记录行为或次数，不是科学幸福指数，也不因中断记录扣除。</p></>}
    {experiment.kind === "energy" && <><label>事件<textarea name="event" maxLength={500} placeholder="发生了什么？" /></label><div className="lab-field-grid"><label>行动前电量<select name="before" defaultValue=""><option value="">1–5</option>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><label>行动后电量<select name="after" defaultValue=""><option value="">1–5</option>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>场景标签 <small>可选</small><input name="scene" maxLength={60} /></label><fieldset className="lab-feelings"><legend>感受 <small>可多选</small></legend><div>{feelingOptions.map((feeling) => <label key={feeling}><input type="checkbox" name="feelings" value={feeling} /><span>{feeling}</span></label>)}</div><label>补充描述 <small>可选</small><textarea name="feeling" maxLength={500} placeholder="也可以写下选项之外的感受。" /></label></fieldset><fieldset><legend>你的主观判断</legend><label className="lab-choice"><input type="radio" name="effect" value="charging" /> 充电</label><label className="lab-choice"><input type="radio" name="effect" value="draining" /> 耗电</label></fieldset><p className="lab-inline-note">耗电不等于失败，它只是一次观察。</p></>}
    {experiment.kind === "action" && <><label>尝试结果<textarea name="result" maxLength={800} placeholder="实际试了什么？发生了什么？" /></label><label>遇到的阻碍 <small>可选</small><textarea name="obstacle" maxLength={500} /></label><label>本次状态<select name="nextStatus" defaultValue=""><option value="">请选择</option><option value="continue">继续</option><option value="adjust">调整</option><option value="finish">结束</option></select></label><p className="lab-inline-note">创建行动不等于完成行动。</p></>}
    <div className="lab-form-actions"><button type="submit" className="lab-primary">保存这次记录</button></div>
  </form>;
}

function TagList({ items, empty }: { items: Array<[string, number]>; empty: string }) {
  return items.length ? <div className="lab-tags">{items.map(([name, count]) => <span key={name}>{name} · {count}</span>)}</div> : <p>{empty}</p>;
}

function Summary({ experiment }: { experiment: LabExperiment }) {
  const summary = summarizeExperiment(experiment);
  return <section className="lab-card lab-summary"><span className="lab-kicker">BASIC SUMMARY</span><h2>{experiment.title}</h2><p>以下仅由此浏览器中的真实记录做基础计算，不是 AI 结论。</p>
    <div className="lab-summary-grid"><div><strong>{summary.count}</strong><span>真实记录次数</span></div>
      {experiment.kind === "glimmer" && "averageWarmth" in summary && <><div><strong>{summary.averageWarmth == null ? "—" : summary.averageWarmth.toFixed(1)}</strong><span>已填写温度的平均值</span></div><div className="lab-summary-wide"><h3>温度分布</h3><div className="lab-bars">{(summary.warmthDistribution ?? []).map((item) => <span key={item.value}><i>{item.value}</i><b style={{ width: `${summary.count ? Math.max(4, item.count / summary.count * 100) : 4}%` }} /><em>{item.count}</em></span>)}</div><h3>常见来源标签</h3><TagList items={summary.commonTags ?? []} empty="还没有来源标签。" /></div></>}
      {experiment.kind === "energy" && "charging" in summary && <><div><strong>{summary.charging} / {summary.draining}</strong><span>充电 / 耗电选择</span></div><div><strong>{(summary.totalChange ?? 0) > 0 ? "+" : ""}{summary.totalChange ?? 0}</strong><span>前后电量总变化</span></div><div className="lab-summary-wide"><h3>常见场景</h3><TagList items={summary.commonScenes ?? []} empty="还没有场景标签。" /><p className="lab-inline-note">耗电不等于失败，它只是一次观察。</p></div></>}
      {experiment.kind === "action" && "latestStatus" in summary && <><div><strong>{summary.latestStatus ? actionStatusName[summary.latestStatus] : "—"}</strong><span>最新状态</span></div><div className="lab-summary-wide"><h3>最近阻碍</h3><p>{summary.recentObstacle ?? "还没有记录阻碍。"}</p><h3>下一步方向</h3><p>{summary.nextDirection ? `${actionStatusName[summary.nextDirection]}：由你的最新记录决定。` : "先完成一次真实尝试。"}</p><p className="lab-inline-note">创建行动不等于完成行动。</p></div></>}
    </div>
  </section>;
}

function AiConfirm({ experiment, go }: { experiment: LabExperiment; go: (view: View) => void }) {
  const [selected, setSelected] = useState(() => new Set(experiment.records.slice(-20).map((record) => record.id)));
  const [report, setReport] = useState<LabReport | null>(null);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");

  function toggleRecord(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generateReport() {
    const records = experiment.records
      .filter((record) => selected.has(record.id))
      .map((record) => {
        const copy: Partial<typeof record> = { ...record };
        delete copy.id;
        return copy;
      });
    if (!records.length) return setRequestError("请至少选择一条记录。");
    setPending(true);
    setRequestError("");
    try {
      const response = await fetch("/api/lab/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: experiment.kind, title: experiment.title, records })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "生成失败，请稍后重试。");
      setReport(payload.report as LabReport);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (report) return <section className="lab-card lab-confirm lab-ai-report"><span className="lab-kicker">AI EXPERIMENT REPORT</span><h2>{report.title}</h2><p>{report.overview}</p><div className="lab-ai-findings">{report.findings.map((finding, index) => <article key={`${finding.title}-${index}`}><span>发现 {index + 1}</span><h3>{finding.title}</h3><p><strong>记录依据：</strong>{finding.evidence}</p><p><strong>可以试试：</strong>{finding.suggestion}</p></article>)}</div>{report.patterns.length > 0 && <><h3>可能的模式</h3><ul>{report.patterns.map((pattern) => <li key={pattern}>{pattern}</li>)}</ul></>}<div className="lab-ai-next"><h3>下一次实验</h3><p>{report.nextExperiment}</p><small>{report.caution}</small></div><p className="lab-inline-note">本报告由 DeepSeek 根据你本次选择的记录生成，仅供参考，不代表科学或医疗结论。</p><div className="lab-actions"><button type="button" onClick={() => setReport(null)}>重新选择记录</button><button type="button" onClick={() => go({ name: "detail", id: experiment.id })}>返回实验</button></div></section>;

  return <section className="lab-card lab-confirm"><span className="lab-kicker">AI EXPERIMENT REPORT</span><h2>确认后生成报告</h2><p>请选择要发送给 DeepSeek 的记录。只有点击“确认并生成”才会发送，最多发送最近 20 条。</p><ul><li>实验：{experiment.title}</li><li>已选记录：{selected.size} 条</li><li>发送内容：记录文本、标签、时间与主观评分</li></ul>
    {experiment.records.length ? <div className="lab-ai-records">{experiment.records.slice(-20).map((record, index) => <label key={record.id}><input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleRecord(record.id)} /><span><strong>记录 {experiment.records.length - Math.min(20, experiment.records.length) + index + 1}</strong><small>{new Date(record.createdAt).toLocaleString("zh-CN")}</small></span></label>)}</div> : <p className="lab-stop-note">还没有实验记录，暂时无法生成报告。</p>}
    {requestError && <p className="lab-error" role="alert">{requestError}</p>}
    <div className="lab-actions"><button type="button" className="lab-primary" disabled={pending || selected.size === 0} onClick={generateReport}>{pending ? "正在生成…" : "确认并生成报告"}</button><button type="button" disabled={pending} onClick={() => go({ name: "detail", id: experiment.id })}>取消</button></div><small>报告不保存到数据库；AI 调用会记录用量，不会自动发布任何内容。</small>
  </section>;
}

function DraftArea({ experiment, value, setValue }: { experiment: LabExperiment; value: string; setValue: (value: string) => void }) {
  return <section className="lab-card lab-draft"><span className="lab-kicker">EDITABLE DRAFT</span><h2>生成可编辑草稿</h2><p><strong>不自动发布。</strong> 当前仅展示未来生成前的确认项，不调用知乎接口。</p>
    <fieldset><legend>未来确认项</legend><label className="lab-choice"><input type="checkbox" defaultChecked /> 使用此实验的 {experiment.records.length} 条记录</label><label className="lab-choice"><input type="checkbox" defaultChecked /> 隐藏私人信息</label><label>输出类型<select defaultValue="想法"><option>想法</option><option>回答提纲</option><option>文章</option></select></label><label className="lab-choice"><input type="checkbox" /> 保留外部来源</label></fieldset>
    <label>可编辑草稿<textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="当前没有伪造内容。你可以在这里手动编辑；若未来用规则整理，将明确标注为“本地模板整理”。" /></label>
    <p className="lab-stop-note">当前本地示意未接入 AI，也没有调用知乎发布接口。</p>
  </section>;
}
