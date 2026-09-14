import Link from "next/link";

export const metadata = { title: "内测与隐私说明 · OnionMind" };

export default function PrivacyPage() {
  return <main className="legal-page"><Link href="/">← 返回 OnionMind</Link><article><span className="eyebrow">PRIVATE BETA</span><h1>内测与隐私说明</h1><p>更新日期：2026 年 9 月 13 日</p><h2>收集什么</h2><p>为提供功能，内测版会保存知乎授权产生的账号标识和访问令牌、你主动创建的笔记和照片、你主动同步的近期收藏摘要，以及你主动生成的记忆卡片和认知反馈。</p><h2>如何使用</h2><p>笔记文字和所选记忆卡片只会在你点击生成时发送给 DeepSeek API。照片压缩为 WebP 后保存在 Hostinger 私有数据库中，仅通过登录鉴权展示，不发送给 AI。知乎令牌经过服务端加密，不会发送到浏览器。</p><h2>产品边界</h2><p>认知反馈是帮助梳理材料的待验证假设，不是医疗、心理诊断或专业治疗建议。遇到紧急危险或健康问题，请联系当地紧急服务和专业人员。</p><h2>你的控制</h2><p>你可以删除笔记并同步删除其中照片。内测期间如需删除全部账号数据或撤回授权，请通过产品方提供的内测联系方式提出；正式开放前将补充自助账号删除入口。</p><h2>第三方服务</h2><p>本产品依赖知乎开放平台完成登录和收藏同步，依赖 DeepSeek 生成结构化内容，并使用 Hostinger 运行网站和保存数据。各服务可能按其政策处理必要数据。</p><p className="legal-warning">请勿在内测版记录账号密码、身份证号码、支付信息或其他不必要的高度敏感信息。</p></article></main>;
}
