import Image from "next/image";
import { Dashboard } from "@/components/dashboard";
import { getCurrentUser } from "@/lib/auth";
import { checkEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ loginError?: string; message?: string }>;
}) {
  const query = await searchParams;
  const configuration = checkEnv();
  if (!configuration.ok) {
    return (
      <main className="center-shell">
        <section className="setup-card">
          <span className="eyebrow">ONIONMIND · SETUP</span>
          <h1>应用等待安全配置</h1>
          <p>服务端环境变量尚未配齐。密钥不应填写在浏览器或提交到 Git。</p>
          <div className="missing-list">缺少：{configuration.missing.join("、")}</div>
        </section>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="landing">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="hero">
          <div className="brand-mark" aria-hidden="true">
            <Image src="/onionmind-icon.png" alt="" width={256} height={256} priority />
          </div>
          <span className="eyebrow">洋葱 · ONIONMIND</span>
          <h1>把想不明白的事，<br />一层层剥开。</h1>
          <p className="hero-copy">连接你的笔记与知乎收藏。每个判断都保留依据，每个洞察都允许被挑战。</p>
          <a className="primary-button login-button" href="/api/auth/zhihu/start">使用知乎账号登录</a>
          {query.loginError && <p className="login-error">{query.message ?? "知乎登录没有完成，请重试。"}</p>}
          <p className="privacy-note">登录即表示你同意<a href="/privacy">内测与隐私说明</a>。照片仅存储展示，不参与 AI 分析。</p>
        </section>
      </main>
    );
  }

  return <Dashboard user={user} />;
}
