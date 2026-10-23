# 反诈回拨实验室 · 分享版

这个站点把本地模拟诈骗电话 Demo 移到 HTTPS 托管环境。访客用自己的 DeepSeek/OpenAI Key 生成王阿姨的回答，用自己的 Fish Audio Key 生成自然语音；硅基流动是备用语音服务。没有真实电话接入。

公开体验地址：<https://scam-call-decoy-pages.pages.dev/>。这是 Cloudflare Pages 正式部署，不依赖本地电脑或临时隧道。访客建议用 Chrome，配置自己的模型和语音 Key，并允许麦克风权限。

Key 只保存在当前浏览器页面的内存中，每次请求通过同源 HTTPS 发送到本站 Worker，再转发给用户选择的固定 API 服务商。本站代码不把 Key 写入文件、数据库或日志。刷新页面后需要重新填写。请勿在录屏或截图中展示 Key。

语音输入使用浏览器的 Web Speech API，建议使用新版 Chrome 并允许麦克风权限。自然语音在浏览器里播放服务商返回的 MP3。访问者所在地区、浏览器和供应商账户权限仍会影响实际体验。

源文件在 `src/`，Worker 路由在 `worker/index.js`。`bash scripts/build.sh` 将三个网页资源嵌入到 `dist/server/index.js`；`node scripts/validate-artifact.mjs` 检查生成的 Worker 模块。

Cloudflare Pages 使用 `bash scripts/build-pages.sh` 生成 `dist/pages/`，其中 `_worker.js` 负责页面与 API。更新发布时，在已登录该 Cloudflare 账号的环境中运行 `wrangler pages deploy dist/pages --project-name scam-call-decoy-pages --branch main`。`wrangler.worker.toml` 仅用于 Workers 临时预部署；访客应使用上面的 Pages 地址。
