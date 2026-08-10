# AGENTS.md — Codex 开发约束与执行指南

本文件是 Codex / 代码 Agent 进入本仓库后的第一入口。修改代码前先阅读：

1. `README.md`
2. `docs/CODEX_HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/ROADMAP.md`
5. `docs/HOST_BRIDGE.md`

## 项目目标

`chatgpt-asset-sync` 的目标是把 ChatGPT 生成的图片/视频/音频等 AI 资产同步到**用户自定义 GitHub 资产仓库**，按项目归档，保留来源元数据，并用 SHA256 做幂等去重。

目标体验：

```text
ChatGPT 生成资产
      ↓
Host Adapter / App
      ↓
ChatGPT Asset Sync
      ↓
项目识别 + SHA256 去重
      ↓
用户配置的 GitHub repository
```

## 当前已完成基线（2026-08-10）

代码版本：`v0.4.0`。

已经实现：

- TypeScript MCP Server。
- 自定义 `repository / branch / basePath`。
- `sync_asset` 单资产同步。
- `import_library_batch` 批量导入协议。
- Migration ZIP Runner。
- SHA256 index。
- sidecar metadata。
- 项目路由基础规则。
- 首次初始化同步状态机。
- `sourceFileId / sourceSurface` 来源追踪。

用户的首次历史 Library 迁移已经**真实完成**：

```text
Target repository: 983033995/openmontage-assets
Asset count:       88
Import commit:     83ddbe0fec1fc3deedf10375765a0abd5fc2014b
Last Library time: 2026-08-10T02:07:59.594373Z
```

资产仓库基线状态：

```text
.chatgpt-asset-sync/state/initial-sync.json
```

不要重新执行这 88 张的全量初始化，除非用户明确要求重建迁移。

## 用户的硬约束

以下约束不得擅自改变：

1. **不以浏览器扩展作为主方案。** 目标要覆盖 ChatGPT Web / Desktop / Mobile；浏览器 DOM 方案不能成为核心架构。
2. **不使用 cron / 定时轮询实现“生成即同步”。** 实时同步必须由生成完成事件、宿主附件交接或显式工作流触发。
3. **资产目标仓库必须可自定义。** 不得把 `983033995/openmontage-assets` 写死为唯一仓库。
4. **首次历史同步与后续实时同步必须共用相同的去重、项目路由、GitHub 写入底座。**
5. **不能伪造同步成功。** 只有 GitHub 写入真正成功才可以报告 synced/completed。
6. **低置信度资产不能丢。** 放入 `_unclassified`，后续允许重新分类。
7. **原始二进制优先。** 不为迁移方便重编码、压缩或改变图片内容。
8. **SHA256 是跨文件名的最终去重键。** 文件改名不能导致重复资产。

## 当前最重要的开发方向

从现在开始不要继续优化一次性 ZIP 流程作为主线。后续主线是：

```text
v0.5  Remote MCP + production persistence
v0.6  GitHub App authentication
v0.7  Apps SDK settings UI / repository picker
v0.8  incremental sync + project mapping
v0.9  security / observability / beta hardening
v1.0  native generated-asset Host Adapter when platform supports it
```

完整任务拆解见 `docs/CODEX_HANDOFF.md`。

## 生产化必须修复的安全问题

### 1. 不再信任模型传入 `profileId`

当前开发版使用 `profileId -> config` 文件存储。生产版必须从 MCP/OAuth 认证上下文获取稳定用户 ID。

禁止：

```text
model input profileId -> 任意读取/修改另一用户配置
```

目标：

```text
authInfo.subject/userId -> server-side config scope
```

生产工具 schema 应逐步移除公开的 `profileId`。

### 2. 不允许 `sync_asset` 任意覆盖 repository

当前 `sync_asset` 允许输入级 `repository / branch / basePath` override，开发期方便，但生产环境会形成数据外传风险。

生产模式应：

- `sync_asset` 只使用当前认证用户已经保存且验证过的 destination config。
- 修改 destination 必须走 `set_asset_repository`。
- `set_asset_repository` 必须验证该 repository 属于用户已授权的 GitHub App installation。

### 3. `sourceUrl` 必须做 SSRF 防护

当前 loader 接受任意 HTTP(S) URL。生产版必须至少：

- 禁止 localhost / loopback。
- 禁止 RFC1918 私网地址。
- 禁止 link-local / metadata endpoints。
- 处理 DNS rebinding 风险。
- 限制响应大小。
- 设置 connect/read timeout。
- 校验 Content-Type。
- 限制重定向次数并重新校验每次目标。

### 4. 不长期保存 PAT / installation token

生产版优先 GitHub App installation token：

- App private key 放 Secret Manager / Vercel encrypted env。
- installation token 短期生成，缓存到过期前，不落长期数据库。
- 不在日志打印 token。

## 代码架构原则

业务核心必须和运行平台解耦。建议逐步形成：

```text
src/domain/
  asset/
  project/
  sync/

src/ports/
  config-store.ts
  sync-state-store.ts
  github-auth.ts
  asset-source.ts

src/adapters/
  db/
  github/
  host/

src/mcp/
  tools/
  server.ts

api/
  mcp.ts
  health.ts
  auth/...
```

不要求一次性大重构；优先小步迁移并保持现有 CLI Migration Runner 可用。

## GitHub 写入约束

批量迁移必须基于目标仓库**当前 tree**创建新 tree，不得创建空 tree 后强推 `main`，否则可能覆盖已有内容。

写入顺序：

```text
read current branch head
→ create blobs
→ create tree with base_tree=current tree
→ create commit parent=current commit
→ fast-forward update ref
```

单资产同步可以继续 Contents API；批量迁移优先 Git Database API 单 commit。

## 资产路径约定

默认：

```text
<basePath>/<project>/<YYYY-MM-DD>/<filename>
```

例如：

```text
projects/pagemind/2026-07-10/image-gen-1.png
```

每个资产：

```text
asset binary
asset binary.json
.chatgpt-asset-sync/index/<sha256>.json
```

metadata 不得编造未知字段。原始 prompt、conversationId、ChatGPT Project 不可获得时写 `null`，不要猜。

## 项目分类优先级

```text
用户显式 project
→ ChatGPT Project / Library folder
→ persisted Conversation → Project mapping
→ conversation title / high-confidence classifier
→ _unclassified
```

AI classifier 只能作为路由辅助，不能覆盖明确用户映射。

## 测试要求

新增生产能力时至少覆盖：

- repository URL normalization。
- basePath sanitization。
- filename/path sanitization。
- SHA256 dedupe。
- duplicate retry。
- project routing priority。
- user isolation。
- unauthorized repository rejection。
- sourceUrl SSRF cases。
- GitHub rate-limit/error handling。
- initial/incremental sync state transitions。

建议引入 Vitest，并提供 mock/fake GitHub adapter，避免单元测试依赖真实 GitHub。

每个里程碑完成前至少运行：

```bash
npm install
npm run typecheck
npm test
```

若引入 lint/format，再加入统一 `npm run check`。

## 平台边界

不要通过代码“假装”解决宿主尚未开放的能力。

当前 Host Adapter 仍是边界：ChatGPT 若没有把原生生成附件交给 App/MCP，则无法保证任意普通对话中的原生图片 100% 自动同步。

因此：

- 可以完成 Remote MCP、GitHub App、数据库、Apps SDK UI、增量状态。
- 可以完成显式附件/URL/上传路径的实时同步。
- Native global `image_generated` adapter 必须等宿主提供真实可用接口后再实现。

实现 ChatGPT App 相关代码前，重新核对 OpenAI 最新官方文档；不要把 2026-08-10 的平台限制永久硬编码为产品事实。

## 提交规范

建议小步提交：

```text
feat: add postgres-backed sync state store
feat: add GitHub App installation auth
feat: add remote MCP deployment entrypoint
fix: block private-network asset source URLs
test: cover sync state transitions
docs: update deployment guide
```

不要把大规模重构、认证、数据库迁移和 UI 全塞进同一个 commit。

## 完成定义

任何阶段不要只以“代码写完”为完成。至少需要：

1. typecheck/test 通过；
2. 关键配置文档完整；
3. staging smoke test 通过；
4. GitHub 实际写入验证；
5. 重试不产生重复资产；
6. 不泄露 token/用户数据；
7. README/ROADMAP 状态同步更新。
