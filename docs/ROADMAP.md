# Roadmap

## v0.1 — 初始化（当前）

- [x] TypeScript MCP Server
- [x] 自定义 GitHub 目标仓库
- [x] 分支 / basePath 配置
- [x] GitHub binary asset upload
- [x] SHA256 去重
- [x] 项目路由基础规则
- [x] Sidecar metadata
- [x] Library 全量导入 contract
- [x] ChatGPT Skill 工作流草案

## v0.2 — 首次全量同步

- [ ] Library image enumerator
- [ ] 批量同步进度与断点续传
- [ ] 历史图片 AI 项目分类
- [ ] Conversation → Project mapping
- [ ] 批量 Git commit，减少一次资产多 commit
- [ ] 同步报告

## v0.3 — Plugin / App

- [ ] Apps SDK 设置 UI
- [ ] OAuth / GitHub App
- [ ] 每用户独立仓库配置
- [ ] Repository picker
- [ ] 项目映射管理 UI

## v1.0 — 原生即时同步

依赖 ChatGPT 宿主提供可用的生成资产事件/附件交接能力：

- [ ] Native generated-asset adapter
- [ ] 图片生成完成即触发 `sync_asset`
- [ ] Web / Desktop / Mobile 统一行为
- [ ] 图片 / 视频 / 音频统一资产协议
