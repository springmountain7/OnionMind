# OnionMind

OnionMind 是一个小范围真实内测网页：用户通过知乎 OAuth 登录，记录图文笔记，同步近期收藏，生成可追溯的记忆卡片与认知反馈。

## 本地启动

1. 复制 `.env.example` 为 `.env.local`，填入 MySQL、知乎和 DeepSeek 配置。
2. 安装依赖：`npm install`
3. 建表：`npm run db:migrate`
4. 启动：`npm run dev`

本地 OAuth 回调只有在知乎开放平台登记了对应 HTTPS 地址时才能真实联调。不要提交任何 `.env*` 密钥文件。

## 验证

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## 生产部署

Hostinger 使用 Node.js 22，构建命令为 `npm run build`，启动命令为 `npm start`。`npm start` 会先执行幂等建表，再启动 Next.js。生产回调固定为：

```text
https://overmountain.xyz/api/auth/zhihu/callback
```

部署成功后仍需用两个真实知乎账号完成端到端和数据隔离验收。
