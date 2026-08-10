# Codex Handoff — ChatGPT Asset Sync 后续完整实施指南

> 更新时间：2026-08-10
>
> 这份文档用于把当前项目完整交接给 Codex。目标不是继续优化一次性历史 ZIP，而是把已经验证成功的同步底座升级成可远程部署、可鉴权、可多用户使用、可接入 ChatGPT App 的正式产品。

---

## 0. 先确认当前真实状态

### 代码仓库

```text
983033995/chatgpt-asset-sync
```

当前版本：

```text
0.4.0
```

### 当前默认资产仓库

```text
983033995/openmontage-assets
```

注意：这只是当前用户的默认目标，不是产品硬编码目标。任何生产代码必须继续支持用户自定义 repository / branch / basePath。

### 首次历史迁移已完成

2026-08-10 已完成 ChatGPT Library 历史生成资产初始化：

```text
资产数：88
目标仓库：983033995/openmontage-assets
导入 commit：83ddbe0fec1fc3deedf10375765a0abd5fc2014b
最后 Library 资产时间：2026-08-10T02:07:59.594373Z
```

目标仓库状态文件：

```text
.chatgpt-asset-sync/state/initial-sync.json
```

因此下一阶段**不要重新做这 88 张初始化**。

---

# 1. 最终产品目标

最终用户体验：

```text
用户安装/连接 ChatGPT Asset Sync
        ↓
连接 GitHub
        ↓
选择自己的资产仓库
        ↓
首次初始化历史资产
        ↓
以后新资产生成/进入工作流时立即同步
        ↓
GitHub 中按项目永久归档
```

目标系统：

```text
                        ChatGPT
                           │
                    Apps SDK / MCP
                           │
                  Authenticated user
                           │
                           ▼
                ChatGPT Asset Sync API
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 Destination Config   Project Router      Sync State
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                     Asset Pipeline
                           │
                 SHA256 + Metadata
                           │
                     GitHub App
                           │
                           ▼
                 User-selected repository
```

---

# 2. 明确不要做的事情

Codex 不要偏离以下方向。

## 不要重新把浏览器扩展作为核心

原因：目标是 Web / Desktop / Mobile 共用，浏览器 DOM 注入无法成为跨端统一架构。

## 不要引入定时任务扫描 ChatGPT

用户明确要求不是每小时/每天轮询。

允许：

- GitHub webhooks 处理 GitHub 安装/权限变化。
- ChatGPT 宿主未来真实事件触发。
- 用户显式执行增量同步。

不允许把“实时同步”偷换成 cron。

## 不要把 OpenAI API 图片生成替换成默认方案

本项目的核心是**资产同步**，不是强制让用户改走 OpenAI Image API。

Asset Source 必须解耦：

```text
ChatGPT native image
OpenAI API
User upload
Future video/audio generation
        ↓
统一 Asset Ingestor
```

## 不要继续长期使用个人 PAT

PAT 只保留开发兼容模式。正式服务使用 GitHub App。

---

# 3. 建议版本路线

## v0.5 — Remote MCP + 持久化底座

目标：项目不再依赖开发者本机长期运行。

完成：

- Remote HTTPS MCP endpoint。
- 云端 `/health`。
- Postgres。
- 用户身份作用域。
- ConfigStore / InitialSyncStore 数据库化。
- 现有 Migration Runner 保持兼容。
- 基础测试体系。

## v0.6 — GitHub App

目标：移除生产 PAT。

完成：

- GitHub App registration 支持。
- installation callback / repository selection。
- installation token provider。
- repository picker API。
- destination repository 权限验证。
- GitHub installation revoke/change webhook。

## v0.7 — Apps SDK UI

目标：用户能在 ChatGPT 内完成设置。

完成：

- Settings card / UI。
- GitHub connection status。
- repository / branch / basePath picker。
- initialization status。
- sync status / latest sync。
- unclassified count。

## v0.8 — Incremental Sync + Project Mapping

目标：初始化之后不重复全量扫描。

完成：

- `lastLibraryCreatedAt` 增量游标。
- `sourceFileId` 幂等。
- conversation → project mapping。
- manual reclassify。
- `_unclassified` 管理。
- incremental sync run reports。

## v0.9 — Production Hardening

完成：

- SSRF 防护。
- rate limits。
- retry/backoff。
- request size limits。
- structured logs。
- tracing / sync run diagnostics。
- OAuth / user isolation review。
- staging / production environments。
- security tests。

## v1.0 — Native Host Adapter

只有在 ChatGPT 宿主真实开放 generated-asset attachment/event 能力后完成：

```text
image generation complete
→ native attachment handoff
→ sync_asset
→ GitHub
```

不要为达到版本号伪造这一能力。

---

# 4. 第一个开发任务：建立测试和 Port/Adapter 边界

不要第一步就把全部代码重写成新框架。

先保证现有能力可测试，再逐步替换存储和认证。

## 4.1 引入测试

推荐：

```text
Vitest
```

package scripts 至少变成：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm test"
  }
}
```

首批测试：

```text
tests/
├── repository.test.ts
├── slug.test.ts
├── project-router.test.ts
├── initial-sync-store.test.ts
├── asset-sync.test.ts
└── security/
    └── source-url.test.ts
```

必须覆盖：

- `owner/repo` normalize。
- GitHub URL normalize。
- 非 github.com URL reject。
- basePath 清洗。
- project slug/path。
- 明确 project 优先于自动分类。
- SHA256 duplicate。
- retry duplicate 不二次上传。
- initial sync 状态转换。

## 4.2 抽象接口

将当前文件存储实现从业务逻辑中抽离。

建议：

```text
src/ports/config-store.ts
src/ports/initial-sync-store.ts
src/ports/github-credential-provider.ts
src/ports/github-storage.ts
```

示例：

```ts
export interface ConfigStore {
  get(userId: string): Promise<AssetRepositoryConfig | null>;
  set(userId: string, config: AssetRepositoryConfig): Promise<AssetRepositoryConfig>;
}
```

```ts
export interface InitialSyncStore {
  get(userId: string): Promise<InitialSyncState | null>;
  save(userId: string, state: InitialSyncState): Promise<void>;
}
```

开发版文件实现保留：

```text
src/adapters/file/file-config-store.ts
src/adapters/file/file-initial-sync-store.ts
```

生产版新增：

```text
src/adapters/db/postgres-config-store.ts
src/adapters/db/postgres-initial-sync-store.ts
```

### 验收

- `AssetSyncService` 不直接知道 JSON 文件路径。
- 测试可以传入 fake store。
- CLI Migration Runner 不被破坏。

---

# 5. v0.5：Postgres 数据模型

推荐使用标准 Postgres + TypeScript ORM。

可选：

```text
Drizzle ORM + postgres driver
```

如果 Codex 选择其他方案，必须满足 serverless/Node 部署、迁移可控、SQL 可审计。

## 5.1 users

```sql
users (
  id uuid primary key,
  auth_subject text unique not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

`auth_subject` 来自 MCP/OAuth 身份，不来自模型输入。

## 5.2 github_installations

```sql
github_installations (
  id uuid primary key,
  user_id uuid not null,
  installation_id bigint not null,
  account_id bigint,
  account_login text,
  account_type text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(user_id, installation_id)
)
```

不要存 installation access token。

## 5.3 sync_configs

```sql
sync_configs (
  user_id uuid primary key,
  github_installation_id uuid,
  repository_id bigint,
  repository_full_name text not null,
  branch text not null default 'main',
  base_path text not null default 'projects',
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

## 5.4 sync_states

```sql
sync_states (
  user_id uuid primary key,
  phase text not null,
  initial_sync_completed boolean not null default false,
  last_library_created_at timestamptz,
  processed_assets integer not null default 0,
  last_commit_sha text,
  last_sync_at timestamptz,
  updated_at timestamptz not null
)
```

## 5.5 sync_runs

用于追踪每次运行：

```sql
sync_runs (
  id uuid primary key,
  user_id uuid not null,
  mode text not null,
  status text not null,
  discovered integer not null default 0,
  synced integer not null default 0,
  duplicates integer not null default 0,
  failed integer not null default 0,
  commit_sha text,
  cursor text,
  error_summary text,
  started_at timestamptz not null,
  completed_at timestamptz
)
```

mode：

```text
initial
incremental
live
manual
```

## 5.6 conversation_project_mappings

```sql
conversation_project_mappings (
  id uuid primary key,
  user_id uuid not null,
  conversation_id text not null,
  project_slug text not null,
  source text not null,
  confidence real,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(user_id, conversation_id)
)
```

## 5.7 assets（可选但推荐）

GitHub index 仍是最终资产归档凭据；数据库保存检索索引。

```sql
assets (
  id uuid primary key,
  user_id uuid not null,
  source_file_id text,
  source_surface text,
  sha256 text not null,
  original_filename text,
  project_slug text not null,
  github_path text not null,
  mime_type text,
  generated_at timestamptz,
  synced_at timestamptz not null,
  metadata jsonb,
  unique(user_id, sha256)
)
```

不要让 DB 成为唯一资产真相；GitHub repository + SHA256 index 必须仍能独立恢复。

---

# 6. v0.5：Remote MCP 部署

## 6.1 目标接口

至少：

```text
GET  /health
GET  /mcp   (若当前 transport/framework需要)
POST /mcp
```

未来认证可能额外需要：

```text
/.well-known/oauth-protected-resource
OAuth provider metadata endpoints
```

## 6.2 部署策略

首选路径：Vercel。

但核心业务不得依赖 Vercel 专属 API，以便未来可以迁移到 Railway/Fly.io/Cloud Run 等。

建议结构：

```text
src/core/...        # framework-independent
src/mcp/...         # MCP tool registration
api/mcp.ts          # Vercel adapter
api/health.ts       # Vercel adapter
```

如果使用 Vercel 官方 `mcp-handler`，先核对其当前版本和 MCP SDK 兼容性，不要盲目复制旧示例。

## 6.3 Stateless 优先

当前 MCP Server 每次 request 创建 server + StreamableHTTP transport，已经接近 stateless 模式。

生产优先保持：

```text
request-scoped MCP transport
```

避免把 session 放进函数内存，因为 serverless instance 不稳定。

如果未来必须使用有状态 MCP session，再引入外部 session store。

## 6.4 环境变量

建议：

```text
NODE_ENV
APP_BASE_URL
DATABASE_URL

# Development fallback only
GITHUB_TOKEN
ASSET_REPOSITORY
ASSET_BRANCH
ASSET_BASE_PATH

# GitHub App
GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET

# MCP/Auth provider
MCP_AUTH_...
```

开发文件 store：

```text
CONFIG_STORE_PATH
INITIAL_SYNC_STORE_PATH
```

仅 local development 使用。

## v0.5 验收

必须完成：

```text
curl https://<staging>/health
```

返回版本与状态。

MCP Inspector/测试客户端可以：

```text
get_sync_config
get_initial_sync_status
resolve_project
```

在 staging 用测试 GitHub 仓库执行 `sync_asset` 成功，并验证：

```text
asset
metadata
index
```

都存在。

---

# 7. 身份系统：ChatGPT Auth 和 GitHub Auth 必须分开

这是后续最容易设计错的地方。

## ChatGPT → Asset Sync

解决：

```text
“是谁在调用 Asset Sync？”
```

身份结果：

```text
userId / authSubject
```

## Asset Sync → GitHub

解决：

```text
“这个用户授权 Asset Sync 写哪些 GitHub 仓库？”
```

使用：

```text
GitHub App installation
```

不要把两者混为一个 OAuth token。

---

# 8. v0.6：GitHub App 实施方案

## 8.1 为什么选择 GitHub App

需要：

- 精细 repository 权限。
- 用户可只授权指定仓库。
- installation token 短期有效。
- 可撤销安装。
- 多用户隔离。
- 不要求用户复制 PAT。

## 8.2 最小权限

优先最小权限：

```text
Repository permissions:
  Contents: Read & write
  Metadata: Read
```

只有当代码真的要修改 `.github/workflows` 才申请 Workflows permission；当前资产同步不需要。

## 8.3 安装流程

```text
ChatGPT / Settings UI
      ↓
Connect GitHub
      ↓
GitHub App install page
      ↓
用户选择 account + repositories
      ↓
setup/callback
      ↓
保存 installation_id
      ↓
列出 installation repositories
      ↓
选择 Asset Repository
```

## 8.4 Token Provider

新增：

```text
GitHubCredentialProvider
```

接口示例：

```ts
interface GitHubCredentialProvider {
  getInstallationToken(input: {
    installationId: number;
    repositoryId?: number;
  }): Promise<{ token: string; expiresAt: Date }>;
}
```

实现可使用 Octokit GitHub App auth，也可以自行 JWT → installation token，但优先使用成熟官方 SDK。

installation token：

- 短期缓存。
- 到期前刷新。
- 不写 DB。
- 不写 log。

## 8.5 Repository validation

生产 `set_asset_repository` 不允许仅凭字符串保存。

必须：

```text
normalize owner/repo
→ resolve repository ID
→ confirm repository belongs to user's installation
→ confirm contents write permission
→ persist config
```

## 8.6 Webhook

建议：

```text
POST /webhooks/github
```

至少处理：

```text
installation
installation_repositories
```

当 repository 被移除授权：

- 标记当前 destination invalid。
- 不继续尝试写入。
- get_sync_status 返回 reconnect_required。

## v0.6 验收

- 无 `GITHUB_TOKEN` 也能写测试资产。
- 用户 A 无法使用用户 B installation。
- 未授权 repo 无法 set。
- installation revoke 后同步返回明确错误。
- token 不出现在日志/DB。

---

# 9. 生产 MCP Tool Schema 调整

当前 tool schema 是开发版，要逐步收紧。

## 9.1 `profileId`

生产移除模型可控的 `profileId`。

替换：

```text
MCP auth context → userId
```

## 9.2 `sync_asset`

生产不要接受：

```text
repository
branch
basePath
```

同步目标只能来自 server-side config。

建议 production input：

```ts
{
  project?: string,
  conversationId?: string,
  conversationTitle?: string,
  chatgptProject?: string,
  sourceFileId?: string,
  sourceSurface?: 'library' | 'conversation' | 'api' | 'upload',
  filename?: string,
  mimeType?: string,
  sourceUrl?: string,
  dataBase64?: string,
  prompt?: string,
  generatedAt?: string
}
```

## 9.3 `set_asset_repository`

输入：

```text
repositoryId / repository full name
branch
basePath
```

服务端验证 GitHub installation。

## 9.4 建议新增工具

```text
get_sync_status
list_available_repositories
list_project_mappings
set_project_mapping
list_unclassified_assets
reclassify_asset
```

不要一次性加很多低价值工具；先完成 Settings UI 真正需要的接口。

---

# 10. v0.7：Apps SDK UI

UI 不是优先于后端，但后端稳定后应立即补。

建议一个 compact settings surface：

```text
ChatGPT Asset Sync

GitHub          Connected: 983033995
Repository      openmontage-assets
Branch          main
Base path       projects

Initial sync    Completed · 88 assets
Last sync       2026-08-10 ...
Unclassified    N

[Change repository]
[Sync new assets]
[Review unclassified]
```

## 页面状态

```text
not_connected
connected_no_repo
ready
initializing
syncing
reconnect_required
error
```

## UI 不直接持有 GitHub token

所有 sensitive 操作必须服务端完成。

## Apps SDK 交付顺序

1. 只读状态卡。
2. GitHub connect。
3. repository picker。
4. sync status。
5. project mapping / unclassified。

不要一开始做大型 dashboard。

---

# 11. v0.8：增量同步

初始化基线：

```text
lastLibraryCreatedAt = 2026-08-10T02:07:59.594373Z
```

增量算法：

```text
read sync state
↓
enumerate assets newer than cursor
↓
filter model_generated=true
↓
resolve project
↓
SHA256 dedupe
↓
sync
↓
only after successful run advance cursor
```

## 游标推进规则

不要在每张成功后直接把全局 cursor 推到最后时间。

推荐：

1. 创建 sync_run。
2. 固定本次 `scanUpperBound`。
3. 处理本次范围所有资产。
4. failed=0 后将 cursor 推进到 upper bound。
5. 如果部分失败，保留 run resume 信息；不要跳过失败资产。

SHA256 是第二层保障，不取代正确 cursor。

## sourceFileId

可以作为 ChatGPT Library 层幂等提示，但不要假设跨平台永远稳定；最终去重仍使用 bytes SHA256。

---

# 12. Project Mapping

生产项目分类不能只靠 filename heuristic。

## 优先级

```text
explicit project
→ current ChatGPT Project / library folder
→ persisted conversation mapping
→ strong filename/context rule
→ AI classifier
→ _unclassified
```

## Persisted mapping

当用户确认一次：

```text
conversation X → pagemind
```

以后该 conversation 优先使用该 mapping。

## Reclassify

初期不要自动移动 GitHub 历史文件。

推荐实现：

```text
reclassify metadata/index first
```

如果需要物理移动资产，必须实现原子/可恢复流程：

```text
create new path
verify
update index
remove old path
```

不能中途丢文件。

---

# 13. v0.9：安全加固

## 13.1 SSRF

当前 `sourceUrl` 是最高优先级安全问题之一。

至少阻止：

```text
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
::1
fc00::/7
fe80::/10
cloud metadata hosts/IPs
```

要求：

- DNS resolve 后检查 IP。
- redirect 每跳重新验证。
- 最大 redirect 数。
- 最大 asset size。
- timeout。
- Content-Type allowlist。

图片初期 allow：

```text
image/png
image/jpeg
image/webp
image/gif
```

未来视频/音频另扩展，不要直接允许任意 MIME。

## 13.2 Body size

生产不要长期保留 `express.json({ limit: '50mb' })` 作为主传输方式。

大文件优先：

```text
signed source URL / file stream
```

base64 只做小文件 fallback。

## 13.3 Path safety

需要阻止：

```text
../
absolute path
null byte
path separator injection
Unicode ambiguity where relevant
```

repository path 必须经过统一 builder。

## 13.4 Multi-user isolation

所有数据库 query 必须带 authenticated `user_id`。

任何 tool 不得通过用户输入指定另一个 userId。

## 13.5 Logs

建议每次调用结构化记录：

```json
{
  "requestId": "...",
  "userIdHash": "...",
  "tool": "sync_asset",
  "runId": "...",
  "repository": "owner/repo",
  "assetCount": 1,
  "result": "synced|duplicate|failed",
  "durationMs": 123
}
```

不要记录：

- GitHub token。
- OAuth secret。
- 原始 base64。
- private signed URL query parameters。
- 不必要的 prompt 全文。

---

# 14. Retry / GitHub API 策略

## 可重试

```text
429
GitHub secondary rate limit
502/503/504
network timeout
```

使用 exponential backoff + jitter。

## 不应盲目重试

```text
401 auth invalid
403 permission denied
404 repository no longer accessible
422 invalid path/ref
```

这些应该转为明确状态。

## Branch concurrency

单资产同步如果多个请求并发更新同一 branch，可能发生 SHA/ref 冲突。

生产建议：

- 写入使用 optimistic retry。
- 发现 branch head changed 时重新读取 head/tree。
- 限制同一 destination repository 的并行 commit 数。

可先做进程内 repository queue，未来多实例改分布式锁/队列。

不要为了简化使用 force push。

---

# 15. Migration Runner 后续定位

现有：

```bash
npm run import:migration -- bundle.zip
```

必须保留。

它的长期定位：

- disaster recovery。
- 离线批量导入。
- 用户从旧版本迁移。
- Debug Host Adapter。

它不再是日常同步主路径。

建议增加：

```text
--dry-run
--repo
--branch
--base-path
--resume
--report <path>
```

如果已有能力不要重复实现。

---

# 16. 当前 ChatGPT 平台能力边界（2026-08-10）

实现前必须重新查看 OpenAI 最新官方文档，因为这部分变化很快。

当前开发假设：

1. Apps SDK 以 MCP 为基础，可用于构建 ChatGPT 内的 app 逻辑/UI。
2. ChatGPT 连接 custom MCP 时需要远程 MCP endpoint；不能把普通 localhost MCP 当正式部署方案。
3. Full MCP write/modify 能力当前主要面向 Business / Enterprise / Edu beta。
4. custom MCP apps 当前在 ChatGPT web 上使用；mobile 支持不能假设已经存在。
5. ChatGPT 当前没有提供本项目所需的通用全局 `image_generated` hook / 任意个人 Library file_id 外部下载 API。

因此分两层验收：

## 我们自己可以完成的

```text
Remote MCP
DB
GitHub App
Settings UI
sync_asset
incremental state
project mapping
security
```

## 需要平台能力后才能最终完成的

```text
任意普通 ChatGPT 对话原生图片生成完成
→ 自动获取附件
→ 无用户额外动作立即 sync_asset
```

平台暂未开放时不要写 fake adapter 报 success。

### 官方参考（实现时重新核对）

- OpenAI: Developer mode and MCP apps in ChatGPT
  - https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt
- OpenAI: Build with the Apps SDK
  - https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk
- OpenAI: Apps in ChatGPT
  - https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
- GitHub: Choosing permissions for a GitHub App
  - https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- GitHub: Generating an installation access token
  - https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- Vercel: Deploy MCP servers to Vercel
  - https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel

---

# 17. Codex 建议执行顺序

不要同时开十个方向。

## Sprint 1 — Stabilize

```text
[ ] add Vitest
[ ] add core unit tests
[ ] extract ConfigStore interface
[ ] extract InitialSyncStore interface
[ ] extract GitHub credential/storage boundaries
[ ] keep current behavior green
```

验收：

```bash
npm run check
```

通过。

## Sprint 2 — Database

```text
[ ] Postgres schema
[ ] migrations
[ ] PostgresConfigStore
[ ] PostgresInitialSyncStore
[ ] sync_runs
[ ] local file adapter retained
```

验收：切 `STORE_DRIVER=postgres` 后 MCP 基本工具工作。

## Sprint 3 — Remote MCP

```text
[ ] Vercel entrypoint
[ ] health endpoint
[ ] staging env
[ ] request-scoped auth context plumbing
[ ] deploy documentation
```

验收：公网 HTTPS endpoint 可由 MCP test client 调用。

## Sprint 4 — GitHub App

```text
[ ] app credentials
[ ] install flow
[ ] installation repository listing
[ ] installation token provider
[ ] remove PAT dependency in production
[ ] repository validation
```

验收：不设置 GITHUB_TOKEN 也能同步到测试 repo。

## Sprint 5 — Production Tool Security

```text
[ ] remove public profileId
[ ] remove repository override from sync_asset
[ ] SSRF guard
[ ] size/time limits
[ ] structured errors
[ ] per-repository commit retry
```

## Sprint 6 — Apps SDK

```text
[ ] status UI
[ ] connect GitHub
[ ] repository picker
[ ] initialization status
[ ] manual sync action
```

## Sprint 7 — Incremental / Mapping

```text
[ ] cursor-based incremental runs
[ ] conversation mapping
[ ] unclassified review
[ ] sync report
```

## Sprint 8 — Beta

```text
[ ] staging E2E
[ ] security review
[ ] docs
[ ] version v0.9
[ ] current ChatGPT platform capability re-check
```

---

# 18. 每个 Sprint 的 Codex 工作方式

建议每次让 Codex：

```text
1. 先读取 AGENTS.md + CODEX_HANDOFF.md
2. 检查当前 git status / latest commits
3. 只处理一个 Sprint 或一个子目标
4. 修改前列出 affected files
5. 编码
6. typecheck/test
7. 自查 security regression
8. 更新 docs/ROADMAP.md
9. 提交清晰 commit
```

不要让 Agent 在没有测试的情况下大规模“重构整个项目”。

---

# 19. 可以直接给 Codex 的第一条任务

复制下面这段作为下一次 Codex 指令：

```text
请先完整阅读仓库根目录 AGENTS.md、docs/CODEX_HANDOFF.md、README.md、docs/ARCHITECTURE.md 和 docs/ROADMAP.md。

当前首次历史资产迁移已经完成，不要重新处理 88 张历史资产。目标仓库的初始化基线是：
- repository: 983033995/openmontage-assets
- assetCount: 88
- import commit: 83ddbe0fec1fc3deedf10375765a0abd5fc2014b
- lastLibraryCreatedAt: 2026-08-10T02:07:59.594373Z

现在只执行 CODEX_HANDOFF.md 的 Sprint 1（Stabilize）：
1. 引入 Vitest；
2. 为 repository normalize、basePath、project router、initial sync state、SHA256 dedupe 添加测试；
3. 把 ConfigStore / InitialSyncStore 抽象成 interface/port，同时保留现有 JSON file adapter；
4. 为后续 GitHubCredentialProvider/GitHubStorage port 做最小抽象，但不要在本 Sprint 实现 GitHub App；
5. 保持 Migration Runner 和现有 MCP tools 行为兼容；
6. npm run typecheck、npm test 必须通过；
7. 更新 docs/ROADMAP.md；
8. 不要引入浏览器扩展、cron，也不要修改资产路径协议。

完成后给出：修改文件、测试结果、未解决问题和下一 Sprint 建议。
```

---

# 20. Definition of Done

产品达到可公开 beta 前，必须至少满足：

## Infrastructure

- [ ] Remote HTTPS MCP。
- [ ] Postgres persistence。
- [ ] staging / prod split。

## Identity

- [ ] authenticated user identity。
- [ ] no model-controlled profileId isolation。

## GitHub

- [ ] GitHub App。
- [ ] selected repository permissions。
- [ ] installation token rotation。
- [ ] no production PAT dependency。

## Sync

- [x] SHA256 dedupe。
- [x] metadata/index。
- [x] initial migration runner。
- [ ] incremental cursor。
- [ ] project mapping persistence。
- [ ] reliable retry/reporting。

## Security

- [ ] SSRF protection。
- [ ] request/file limits。
- [ ] repository authorization validation。
- [ ] token redaction。
- [ ] multi-user isolation tests。

## ChatGPT

- [ ] custom app can connect to staging Remote MCP on currently supported plan/surface。
- [ ] status/config UI。
- [ ] write action end-to-end on a supported ChatGPT workspace plan。
- [ ] current platform limitations documented。

## Native realtime

- [ ] only mark complete when ChatGPT exposes a reliable generated-asset handoff/event usable by the app across intended surfaces。

---

## 最重要的一条

本项目已经证明：

```text
ChatGPT Library → 原始资产 → 分类 → SHA256 → GitHub
```

这条资产管线是可行的。

后续 Codex 的核心任务不是重新证明迁移，而是把它变成：

```text
单用户本地工具
        ↓
认证的 Remote MCP
        ↓
GitHub App
        ↓
ChatGPT App
        ↓
多用户、可配置、可恢复、可审计的资产同步产品
```
