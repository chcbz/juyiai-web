# JuyiAI Web — 公开源码配置

在根仓使用 `web/` 子模块，或独立克隆 `chcbz/juyiai-web`。

复制 `.env.example` 为未跟踪的 `.env.local`，按自己的 API/OAuth 环境填写。
使用项目锁定的 Node/npm 依赖和现有 `package.json` 命令。

本地开发默认 HTTP。需要 HTTPS 时在私有环境配置 `VITE_DEV_HTTPS_KEY`、`VITE_DEV_HTTPS_CERT` 和可选的 `VITE_DEV_HTTPS_PASSPHRASE`；不再分发预生成的私钥和证书。
模型/API 密钥只能保存在后端或 Runtime 私有配置中，不得放进任何 `VITE_*` 变量或前端产物。

此次源码迁移不代表完成全部页面、OAuth 回调或生产发布验收。
