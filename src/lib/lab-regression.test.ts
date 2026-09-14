import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const dashboard = readFileSync(join(root, "src/components/dashboard.tsx"), "utf8");
const lab = readFileSync(join(root, "src/components/lab/lab-panel.tsx"), "utf8");
const labRoute = readFileSync(join(root, "src/app/api/lab/report/route.ts"), "utf8");
const review = readFileSync(join(root, "src/app/review/page.tsx"), "utf8");

describe("洋葱实验回归边界", () => {
  it("保持蓝紫主题变量且没有绿色变量", () => {
    for (const token of ["--ink:#27233f", "--muted:#6f6a84", "--paper:#f4eeff", "--panel:#fffdf7", "--primary:#245bc5", "--primary-bright:#2f68d2", "--lavender:#a98be8", "--lavender-soft:#d8c8f5", "--line:#ded5f1", "--danger:#a34538", "--accent:var(--lavender)"]) expect(css.toLowerCase()).toContain(token);
    expect(css).not.toMatch(/--(?:green|lime)\s*:/i);
  });

  it("手机端仍是顶部五列且没有固定底部导航", () => {
    expect(css).toContain(".sidebar nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}");
    expect(css).not.toMatch(/\.sidebar nav\{[^}]*position\s*:\s*fixed/i);
  });

  it("实验 CSS 不覆盖受保护共享选择器", () => {
    const labCss = css.slice(css.indexOf("/* Onion Lab stays isolated"));
    const blocks = labCss.split("}").map((block) => block.split("{")[0]?.trim()).filter(Boolean);
    for (const selector of blocks) {
      if (selector.startsWith("@media") || selector.startsWith("/*")) continue;
      for (const part of selector.split(",")) expect(part.trim()).toMatch(/^\.lab-/);
    }
    expect(labCss).not.toMatch(/(^|,|\})\s*(html|body|\.app-shell|\.workspace|\.sidebar|\.panel|\.toast|\.primary-button|\.secondary-button)(?=[\s,{.:>#])/m);
  });

  it("用户可见名称统一且保留前四个 Panel", () => {
    expect(dashboard).toContain('["lab", "洋葱实验"]');
    expect(`${dashboard}\n${lab}`).not.toContain("洋葱试验场");
    for (const panel of ["NotesPanel", "FavoritesPanel", "CardsPanel", "FeedbackPanel"]) expect(dashboard).toContain(`function ${panel}`);
  });

  it("实验模块只新增专用 AI 报告 API，不新增数据库或迁移文件", () => {
    const apiNames = readdirSync(join(root, "src/app/api"));
    expect(apiNames).toContain("lab");
    expect(readdirSync(join(root, "src/db"))).toEqual(expect.arrayContaining(["index.ts", "schema.ts"]));
    expect(lab).toContain('fetch("/api/lab/report"');
    expect(labRoute).toContain("requireUser()");
    expect(labRoute).not.toMatch(/feedbackReports|\.insert\(/);
    expect(lab).not.toContain("发布成功");
  });

  it("AI 仅在明确确认后发送并保留知乎发布边界", () => {
    expect(lab).toContain("确认并生成报告");
    expect(lab).toContain("只有点击“确认并生成”才会发送");
    expect(lab).toContain("不自动发布。");
    expect(lab).not.toContain("发布成功");
  });

  it("电量记录提供多选感受并保留补充描述", () => {
    for (const feeling of ["轻松", "平静", "专注", "愉快", "疲惫", "焦虑", "烦躁"]) expect(lab).toContain(`"${feeling}"`);
    expect(lab).toContain('name="feelings"');
    expect(lab).toContain('name="feeling"');
  });

  it("审核入口只允许 development 环境", () => {
    expect(review).toContain('process.env.NODE_ENV !== "development"');
    expect(review).toContain("notFound()");
  });
});
