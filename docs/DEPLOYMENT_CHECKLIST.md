# OnionMind 部署与真实验收清单

## Hostinger 目标

- 账户：`u352850427`
- 网站：`overmountain.xyz`
- 禁止改动：`overmountain.blog`
- Node.js：22
- 类型：Next.js
- 构建：`npm run build`
- 启动：`npm start`

部署归档必须排除 `.env*`、`node_modules`、`.next`、测试覆盖率和本地日志。

## 环境变量

Hostinger 的环境变量更新是**整组替换**。不能把后台返回的掩码 `********` 写回去。必须一次提交以下完整真实值：

- `NODE_ENV=production`
- `DATABASE_URL`
- `APP_ORIGIN=https://overmountain.xyz`
- `SESSION_TTL_DAYS=30`
- `TOKEN_ENCRYPTION_KEY`：32 个随机字节的 Base64
- `ZHIHU_APP_ID`
- `ZHIHU_APP_KEY`
- `ZHIHU_ACCESS_SECRET`
- `ZHIHU_REDIRECT_URI=https://overmountain.xyz/api/auth/zhihu/callback`
- `ZHIHU_AUTHORIZE_URL=https://openapi.zhihu.com/authorize`
- `ZHIHU_TOKEN_URL=https://openapi.zhihu.com/access_token`
- `ZHIHU_USERINFO_URL=https://openapi.zhihu.com/user`
- `ZHIHU_API_BASE_URL=https://developer.zhihu.com`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_CARD_MODEL=deepseek-v4-flash`
- `DEEPSEEK_FEEDBACK_MODEL=deepseek-v4-flash`

## 上线门槛

1. `GET /api/health` 返回 `200`、`ok: true`、`database: true`。
2. 知乎真实回调必须带回匹配的 `state`；否则登录会被拒绝，这是安全门槛。
3. 用户资料接口必须返回稳定的 `id`、`uid` 或 `url_token`；不能用昵称替代。
4. 使用两个真实知乎账号分别写笔记和同步收藏，确认互相不可读取。
5. 上传 JPEG、PNG、WebP，并确认未登录请求 `/api/images/:id` 返回 `401`。
6. 同一收藏同步两次后记录不重复。
7. 卡片只能引用所选收藏 ID；认知反馈只能引用所选笔记或卡片 ID。
8. 上传照片后确认数据库只保存 WebP、最长边不超过 1600px，单张不超过 1 MB；删除笔记后图片记录级联删除。
9. 日志中不得出现笔记全文、OAuth token、App Key、Access Secret 或 DeepSeek Key。

## 尚不能由静态检查替代的项目

- 知乎 OAuth、用户资料与收藏接口的真实账号联调
- Hostinger MySQL 图片写入、鉴权读取与空间增长
- DeepSeek 真实返回、额度和延迟
- Hostinger 生产进程启动和公网完整链路
- 两个真实用户的数据隔离验收
