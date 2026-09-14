import { notFound } from "next/navigation";
import { Dashboard, type Tab } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { tab } = await searchParams;
  const initialTab: Tab = ["notes", "favorites", "cards", "feedback", "lab"].includes(tab ?? "") ? tab as Tab : "notes";

  return <>
    <div style={{ position: "fixed", zIndex: 200, right: 12, bottom: 12, padding: "7px 10px", borderRadius: 999, background: "#27233F", color: "white", fontSize: 11, pointerEvents: "none" }}>
      本地前端审核模式
    </div>
    <Dashboard user={{ id: "local-review", displayName: "本地审核", avatarUrl: null }} initialTab={initialTab} reviewMode />
  </>;
}
