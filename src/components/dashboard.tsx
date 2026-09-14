"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { availableImageSlots, mergeSelectedFiles } from "@/lib/file-selection";
import { LabPanel } from "@/components/lab/lab-panel";

type User = { id: string; displayName: string | null; avatarUrl: string | null };
type Note = {
  id: string;
  title: string | null;
  body: string;
  updatedAt: string;
  images: Array<{ id: string; url: string; mimeType: string }>;
};
type ZhihuItem = {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  authorName: string | null;
  favoriteAt: string | null;
};
type Card = {
  id: string;
  sourceItemId: string;
  sourceTitle: string;
  sourceUrl: string;
  authorName: string | null;
  data: {
    coreClaim: string;
    evidence: string[];
    conditions: string[];
    counterpoints: string[];
    question: string;
    keywords: string[];
  };
};
type Report = {
  id: string;
  createdAt: string;
  data: {
    theme: string;
    observations: Array<{ text: string; sourceIds: string[] }>;
    hypotheses: Array<{ text: string; support: "弱" | "中" | "强"; sourceIds: string[] }>;
    alternatives: string[];
    uncertainties: string[];
    keyQuestion: string;
    nextAction: string;
  };
};
export type Tab = "notes" | "favorites" | "cards" | "feedback" | "lab";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "请求失败，请稍后重试。");
  return payload as T;
}

export function Dashboard({ user, initialTab = "notes", reviewMode = false }: { user: User; initialTab?: Tab; reviewMode?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [notes, setNotes] = useState<Note[]>([]);
  const [items, setItems] = useState<ZhihuItem[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [noteData, itemData, cardData, feedbackData] = await Promise.all([
      api<{ notes: Note[] }>("/api/notes"),
      api<{ items: ZhihuItem[] }>("/api/zhihu/items"),
      api<{ cards: Card[] }>("/api/memory-cards"),
      api<{ reports: Report[] }>("/api/feedback")
    ]);
    setNotes(noteData.notes);
    setItems(itemData.items);
    setCards(cardData.cards);
    setReports(feedbackData.reports);
  }, []);

  useEffect(() => {
    if (reviewMode) return;
    const timer = window.setTimeout(() => {
      void refresh().catch((error) => setMessage(error.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, reviewMode]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const tabs: Array<[Tab, string]> = [
    ["notes", "我的笔记"],
    ["favorites", "知乎收藏"],
    ["cards", "记忆卡片"],
    ["feedback", "认知反馈"],
    ["lab", "洋葱实验"]
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Image className="mini-onion" src="/onionmind-icon.png" alt="" width={256} height={256} />洋葱 <small>OnionMind</small></div>
        <button type="button" className="mobile-logout" disabled={busy} onClick={() => run(logout)}>退出登录</button>
        <nav>{tabs.map(([value, label], index) => (
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
            <span>0{index + 1}</span>{label}
          </button>
        ))}</nav>
        <div className="account">
          <div className="avatar">{user.displayName?.slice(0, 1) ?? "知"}</div>
          <div><strong>{user.displayName ?? "知乎用户"}</strong><small>内测账号</small></div>
          <button aria-label="退出登录" onClick={() => run(logout)}>↗</button>
        </div>
      </aside>
      <section className={`workspace ${tab === "notes" ? "notes-workspace" : "secondary-workspace"}`}>
        <header className="topbar"><span>PRIVATE BETA</span><i />照片不会发送给 AI</header>
        {message && <div className="toast" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}
        {tab === "notes" && <NotesPanel notes={notes} busy={busy} run={run} refresh={refresh} />}
        {tab === "favorites" && <FavoritesPanel items={items} selected={selectedItems} setSelected={setSelectedItems} busy={busy} run={run} refresh={refresh} setTab={setTab} notify={setMessage} />}
        {tab === "cards" && <CardsPanel cards={cards} />}
        {tab === "feedback" && <FeedbackPanel notes={notes} cards={cards} reports={reports} selected={selectedSources} setSelected={setSelectedSources} busy={busy} run={run} refresh={refresh} notify={setMessage} />}
        {tab === "lab" && <LabPanel userId={user.id} sourceOptions={[...items.map((item) => ({ type: "知乎收藏" as const, title: item.title, url: item.sourceUrl })), ...reports.map((report) => ({ type: "认知反馈" as const, title: report.data.theme }))]} />}
      </section>
    </main>
  );
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="panel-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

function NotesPanel({ notes, busy, run, refresh }: { notes: Note[]; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const filePreviews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => () => {
    filePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [filePreviews]);

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview]);

  function reset() { setEditing(null); setTitle(""); setBody(""); setFiles([]); setRemovedImageIds([]); setPreview(null); }
  function edit(note: Note) { setEditing(note); setTitle(note.title ?? ""); setBody(note.body); setFiles([]); setRemovedImageIds([]); setPreview(null); }
  function openPreview(url: string, alt: string) { setPreviewScale(1); setPreview({ url, alt }); }
  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const limit = availableImageSlots(editing?.images.map((image) => image.id) ?? [], removedImageIds);
    const incoming = Array.from(event.target.files ?? []);
    setFiles((current) => mergeSelectedFiles(current, incoming, limit));
    event.target.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      let noteId = editing?.id;
      if (noteId) {
        const imageIdsToRemove = removedImageIds;
        await api(`/api/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ title, body, removeImageIds: imageIdsToRemove }), headers: { "Content-Type": "application/json" } });
        setEditing((current) => {
          if (!current || current.id !== noteId) return current;
          return { ...current, images: current.images.filter((image) => !imageIdsToRemove.includes(image.id)) };
        });
        setRemovedImageIds([]);
      } else {
        const result = await api<{ note: Note }>("/api/notes", { method: "POST", body: JSON.stringify({ title, body }), headers: { "Content-Type": "application/json" } });
        noteId = result.note.id;
      }
      for (const file of files) {
        const form = new FormData(); form.set("file", file);
        await api(`/api/notes/${noteId}/images`, { method: "POST", body: form });
      }
      reset(); await refresh();
    });
  }

  return <div className="panel notes-panel"><PanelHeading eyebrow="CAPTURE" title="留下此刻的想法" description="文字属于你的私人空间。照片只保存与展示，不参与 AI 分析。" />
    <div className="notes-layout">
      <section className="notes-recent" aria-label="最近笔记">
        <header className="notes-recent-header">
          <div><strong>最近笔记</strong><span>{notes.length}</span><small>选择一条继续编辑</small></div>
          <button type="button" onClick={reset}>＋ 新建</button>
        </header>
        <div className="list-stack note-compact-list">{notes.length === 0 ? <Empty text="还没有笔记。写下第一层吧。" /> : notes.map((note) => <article className={`note-card note-list-card${editing?.id === note.id ? " is-active" : ""}`} key={note.id}>
          <button type="button" className="note-select" onClick={() => edit(note)}>
            <small>{new Date(note.updatedAt).toLocaleString("zh-CN")}</small>
            <h3>{note.title || "无标题笔记"}</h3>
            <p>{note.body}</p>
            {note.images.length > 0 && <div className="image-row">{note.images.map((image) => <Image key={image.id} src={image.url} alt="笔记照片" width={48} height={40} unoptimized />)}</div>}
          </button>
          <div className="card-actions"><button type="button" onClick={() => edit(note)}>编辑</button><button type="button" className="danger" onClick={() => run(async () => { if (!window.confirm("删除这篇笔记及其照片？")) return; await api(`/api/notes/${note.id}`, { method: "DELETE" }); if (editing?.id === note.id) reset(); await refresh(); })}>删除</button></div>
        </article>)}</div>
      </section>
      <form className="editor-card notes-editor" onSubmit={submit}>
        <header className="notes-editor-header"><div><span>{editing ? "编辑笔记" : "新建笔记"}</span><strong>{editing?.title || "记录此刻"}</strong></div>{editing && <small>更新于 {new Date(editing.updatedAt).toLocaleString("zh-CN")}</small>}</header>
        <input aria-label="笔记标题" placeholder="标题（可选）" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea aria-label="笔记正文" placeholder="不用整理好再写，从最外面这一层开始。" maxLength={30000} required value={body} onChange={(e) => setBody(e.target.value)} />
        {(((editing?.images.length ?? 0) - removedImageIds.length > 0) || filePreviews.length > 0) && <div className="editor-image-row"><span>图片预览</span><div className="image-row">
          {editing?.images.filter((image) => !removedImageIds.includes(image.id)).map((image) => <div className="editor-image-preview" key={image.id}><button type="button" className="editor-image-open" aria-label="放大已有笔记照片" onClick={() => openPreview(image.url, "已有笔记照片")}><Image src={image.url} alt="已有笔记照片" width={92} height={72} unoptimized /></button><button type="button" className="editor-image-remove" aria-label="移除已有笔记照片" onClick={(event) => { event.stopPropagation(); setRemovedImageIds((current) => [...current, image.id]); }}>×</button></div>)}
          {filePreviews.map(({ file, url }, index) => <div className="editor-image-preview is-new" key={`${file.name}-${file.lastModified}`}><button type="button" className="editor-image-open" aria-label={`放大待上传照片 ${index + 1}`} onClick={() => openPreview(url, `待上传照片 ${index + 1}`)}><Image src={url} alt={`待上传照片 ${index + 1}`} width={92} height={72} unoptimized /></button><button type="button" className="editor-image-remove" aria-label={`移除照片 ${index + 1}`} onClick={(event) => { event.stopPropagation(); setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); }}>×</button></div>)}
        </div></div>}
        <div className="editor-actions"><label className="file-button">＋ 添加照片<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} /></label><span>{files.length ? `已选 ${files.length} 张，可在上方预览` : "最多 3 张 · 单张 5 MB · 自动压缩"}</span><div className="grow" />{editing && <button type="button" className="text-button" onClick={reset}>取消</button>}<button className="primary-button" disabled={busy}>{editing ? "保存修改" : "保存笔记"}</button></div>
      </form>
    </div>
    {preview && <div className="image-preview-overlay" role="dialog" aria-modal="true" aria-label="图片放大预览" onClick={() => setPreview(null)}>
      <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="image-preview-close" aria-label="关闭图片预览" onClick={() => setPreview(null)}>×</button>
        <div className="image-preview-canvas"><Image src={preview.url} alt={preview.alt} width={1200} height={900} unoptimized style={{ width: `${previewScale * 100}%`, height: "auto", maxWidth: "none" }} /></div>
        <div className="image-preview-controls"><button type="button" aria-label="缩小图片" disabled={previewScale <= 1} onClick={() => setPreviewScale((value) => Math.max(1, value - 0.25))}>−</button><input aria-label="图片缩放比例" type="range" min="1" max="3" step="0.25" value={previewScale} onChange={(event) => setPreviewScale(Number(event.target.value))} /><button type="button" aria-label="放大图片" disabled={previewScale >= 3} onClick={() => setPreviewScale((value) => Math.min(3, value + 0.25))}>＋</button><output>{Math.round(previewScale * 100)}%</output></div>
      </div>
    </div>}
  </div>;
}

function FavoritesPanel({ items, selected, setSelected, busy, run, refresh, setTab, notify }: { items: ZhihuItem[]; selected: string[]; setSelected: (ids: string[]) => void; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>; setTab: (tab: Tab) => void; notify: (message: string) => void }) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      setSelected(selected.filter((value) => value !== id));
    } else if (selected.length < 5) {
      setSelected([...selected, id]);
    } else {
      notify("每次最多选择 5 条收藏生成记忆卡片。");
    }
  }
  return <div className="panel favorites-panel"><PanelHeading eyebrow="COLLECT" title="把收藏变成可回想的知识" description="首版同步最近 50 条知乎收藏。选择最多 5 条生成记忆卡片。" />
    <div className="toolbar favorites-toolbar"><button className="secondary-button" disabled={busy} onClick={() => run(async () => { const result = await api<{ synced: number }>("/api/zhihu/sync", { method: "POST" }); await refresh(); notify(`已同步 ${result.synced} 条近期收藏。`); })}>↻ 同步最近收藏</button><span className="selection-count"><b>{selected.length}</b>/5 已选择</span><div className="grow" /><button className="primary-button" disabled={busy || selected.length === 0} onClick={() => run(async () => { await api("/api/memory-cards/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: selected }) }); setSelected([]); await refresh(); setTab("cards"); })}>生成记忆卡片</button></div>
    <div className="grid-list favorites-grid">{items.length === 0 ? <Empty text="登录后同步你的近期知乎收藏。" /> : items.map((item) => <label className={`source-card favorite-card ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}><input className="favorite-check" type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><div><div className="favorite-meta"><small>{item.authorName ?? "知乎作者"}</small>{item.favoriteAt && <time dateTime={item.favoriteAt}>{new Date(item.favoriteAt).toLocaleDateString("zh-CN")}</time>}</div><h3>{item.title}</h3><p>{item.summary || "该条目没有返回摘要。"}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>查看知乎原文 ↗</a></div></label>)}</div>
  </div>;
}

function CardsPanel({ cards }: { cards: Card[] }) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const activeCard = cards.find((card) => card.id === activeCardId) ?? cards[0];
  return <div className="panel cards-panel"><PanelHeading eyebrow="REMEMBER" title="不是摘抄，是可以重新调用的理解" description="所有卡片仅基于知乎返回的摘要生成，并保留原文入口。" />
    {cards.length === 0 ? <Empty text="从知乎收藏中选择内容，生成第一张卡片。" /> : <div className="cards-layout">
      <aside className="card-index" aria-label="记忆卡片目录">
        <header><strong>记忆卡片</strong><span>{cards.length}</span></header>
        <div className="card-index-list">{cards.map((card) => <button type="button" className={activeCard?.id === card.id ? "active" : ""} key={card.id} onClick={() => setActiveCardId(card.id)}><small>{card.authorName ?? "知乎作者"}</small><b>{card.data.coreClaim}</b><span>{card.data.keywords.slice(0, 3).join(" · ")}</span></button>)}</div>
      </aside>
      {activeCard && <article className="memory-card memory-card-detail"><div className="card-kicker">仅基于摘要 · {activeCard.authorName ?? "知乎作者"}</div><h2>{activeCard.data.coreClaim}</h2><div className="card-block"><b>关键依据</b><ul>{activeCard.data.evidence.map((value) => <li key={value}>{value}</li>)}</ul></div><div className="card-block"><b>反例或限制</b><ul>{activeCard.data.counterpoints.map((value) => <li key={value}>{value}</li>)}</ul></div><blockquote>{activeCard.data.question}</blockquote><div className="tags">{activeCard.data.keywords.map((tag) => <span key={tag}>{tag}</span>)}</div><a href={activeCard.sourceUrl} target="_blank" rel="noreferrer">{activeCard.sourceTitle} ↗</a></article>}
    </div>}
  </div>;
}

function FeedbackPanel({ notes, cards, reports, selected, setSelected, busy, run, refresh, notify }: { notes: Note[]; cards: Card[]; reports: Report[]; selected: string[]; setSelected: (ids: string[]) => void; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [generationFailed, setGenerationFailed] = useState(false);
  const choices = useMemo(() => [
    ...notes.map((note) => ({ key: `note:${note.id}`, label: note.title || note.body.slice(0, 36), type: "笔记" })),
    ...cards.map((card) => ({ key: `card:${card.id}`, label: card.data.coreClaim.slice(0, 48), type: "卡片" }))
  ], [notes, cards]);
  function toggle(key: string) {
    if (selected.includes(key)) {
      setSelected(selected.filter((value) => value !== key));
    } else if (selected.length < 10) {
      setSelected([...selected, key]);
    } else {
      notify("每次最多选择 10 份材料生成认知反馈。");
    }
  }
  const latest = reports[0];
  return <div className="panel feedback-panel"><PanelHeading eyebrow="REFLECT" title="看见判断，也看见判断从哪里来" description="选择最多 10 份材料主动生成。观察不是诊断，假设也不是事实。" />
    <div className="feedback-layout"><section className="source-picker"><div className="section-label">选择材料 <b>{selected.length}/10</b></div><div className="source-picker-list">{choices.length === 0 ? <Empty text="先写笔记或生成记忆卡片。" /> : choices.map((choice) => <label key={choice.key} className={selected.includes(choice.key) ? "picked" : ""}><input type="checkbox" checked={selected.includes(choice.key)} onChange={() => toggle(choice.key)} /><span>{choice.type}</span><p>{choice.label}</p></label>)}</div><button className="primary-button wide" disabled={busy || selected.length === 0} onClick={() => { setGenerationFailed(false); return run(async () => { const sources = selected.map((key) => { const [type, id] = key.split(":"); return { type, id }; }); try { await api("/api/feedback/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }) }); } catch (error) { setGenerationFailed(true); throw error; } setSelected([]); await refresh(); }); }}>生成认知反馈</button></section>
      <section className="report">{!latest ? <Empty text="你的认知反馈会出现在这里，并标明依据与不确定性。" /> : <div className="report-content"><header className="report-header">{generationFailed && <span className="report-date">本次生成失败，以下为上次生成结果</span>}<span className="report-date">{new Date(latest.createdAt).toLocaleString("zh-CN")}</span><h2>{latest.data.theme}</h2></header><section className="report-section"><h3>有材料支持的观察</h3>{latest.data.observations.map((item) => <p key={item.text}>{item.text}</p>)}</section><section className="report-section hypothesis-section"><h3>待验证的假设</h3>{latest.data.hypotheses.map((item) => <div className="hypothesis" key={item.text}><span>{item.support}支持度</span>{item.text}</div>)}</section><section className="report-section alternative-section"><h3>其他解释</h3><ul>{latest.data.alternatives.map((item) => <li key={item}>{item}</li>)}</ul></section><div className="question-box"><small>下一层问题</small>{latest.data.keyQuestion}</div><div className="action-box"><small>一个小行动</small>{latest.data.nextAction}</div><p className="disclaimer">这是认知整理工具生成的待验证反馈，不是医疗或心理诊断。</p></div>}</section></div>
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><div className="empty-onion" /><p>{text}</p></div>; }
