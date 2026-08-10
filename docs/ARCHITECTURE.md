# Architecture

> 当前代码版本：v0.4.0。本文描述后续生产化目标架构；现有实现仍包含本地 JSON store 和开发 PAT fallback。

## 1. 核心原则

`chatgpt-asset-sync` 是**资产同步层**，不是图片生成器本身。

资产来源必须与同步服务解耦：

```text
Asset Sources
 ├── ChatGPT native generation
 ├── ChatGPT Library
 ├── OpenAI API
 ├── user upload
 └── future video/audio sources
           │
           ▼
      Host Adapter
           │
           ▼
  ChatGPT Asset Sync
           │
           ├── Identity
           ├── Destination Config
           ├── Project Router
           ├── Asset Loader
           ├── Security Guard
           ├── SHA256 Deduper
           ├── Sync State
           └── GitHub Storage
                    │
                    ▼
          User-selected Asset Repository
```

## 2. 代码仓库与资产仓库是两个概念

- `983033995/chatgpt-asset-sync`：程序代码。
- Asset Repository：实际资产存储位置。

当前用户的默认资产仓库是：

```text
983033995/openmontage-assets
```

但生产系统必须支持：

```text
owner/repo
branch
basePath
```

运行时配置，不得要求 fork 修改源码。

## 3. 当前真实迁移基线

首次历史同步已完成：

```text
Asset count:       88
Import commit:     83ddbe0fec1fc3deedf10375765a0abd5fc2014b
Last Library time: 2026-08-10T02:07:59.594373Z
```

资产仓库状态：

```text
.chatgpt-asset-sync/state/initial-sync.json
```

后续增量同步必须从该游标之后处理，不重复全量初始化。

## 4. 生产身份边界

必须区分两层身份。

### ChatGPT → Asset Sync

解决：谁在调用同步服务。

```text
MCP/OAuth auth context
      ↓
server-side userId
```

生产环境不能继续信任模型传入的 `profileId`。

### Asset Sync → GitHub

解决：该用户允许同步服务写哪些 GitHub 仓库。

```text
userId
  ↓
GitHub App installation
  ↓
short-lived installation token
  ↓
selected repository
```

不要把 ChatGPT 登录身份与 GitHub repository authorization 混为同一个 token。

## 5. 推荐生产模块边界

目标结构：

```text
src/
├── domain/
│   ├── asset/
│   ├── project/
│   └── sync/
├── ports/
│   ├── config-store.ts
│   ├── initial-sync-store.ts
│   ├── github-credential-provider.ts
│   ├── github-storage.ts
│   └── asset-source.ts
├── adapters/
│   ├── db/
│   ├── file/
│   ├── github/
│   └── host/
├── mcp/
│   ├── tools/
│   └── server.ts
└── security/
    └── source-url-policy.ts

api/
├── mcp.ts
├── health.ts
├── github/
│   ├── callback.ts
│   └── webhook.ts
└── auth/...
```

不要求一次完成重构。优先通过 ports 把当前服务逐步抽离。

## 6. Persistence

开发版：

```text
JSON file stores
```

生产版：

```text
Postgres
```

至少保存：

```text
users
sync_configs
github_installations
sync_states
sync_runs
conversation_project_mappings
```

可增加 `assets` 作为检索索引，但 GitHub repository + `.chatgpt-asset-sync/index/<sha256>.json` 仍应能独立恢复资产状态。

## 7. 去重策略

最终资产 bytes：

```text
SHA256(bytes)
```

索引：

```text
.chatgpt-asset-sync/index/<sha256>.json
```

判定优先：

```text
sourceFileId -> cheap source-level hint
SHA256       -> authoritative content dedupe
```

文件名不能作为去重键。

## 8. Asset path

默认：

```text
<basePath>/<project>/<YYYY-MM-DD>/<filename>
```

例：

```text
projects/pagemind/2026-07-10/image-gen-1.png
```

sidecar：

```text
projects/pagemind/2026-07-10/image-gen-1.png.json
```

SHA index：

```text
.chatgpt-asset-sync/index/<sha256>.json
```

metadata 只能写真实已知信息；未知 prompt/conversation/project 信息写 null，不猜测。

## 9. Project resolution

```text
explicit user project
        ↓
ChatGPT Project / Library folder
        ↓
persisted Conversation → Project mapping
        ↓
high-confidence rules/context
        ↓
AI classifier
        ↓
_unclassified
```

明确映射始终优先于 AI classifier。

## 10. GitHub 写入

### 单资产

可以使用 Contents API，保持实现简单。

### 批量迁移

使用 Git Database API：

```text
read current branch head
→ create blobs
→ create tree(base_tree=current tree)
→ create commit(parent=current head)
→ fast-forward branch ref
```

禁止从空 tree 构建后覆盖已有分支。

### 并发

生产环境需要针对同一 destination repository 处理 branch head race：

```text
optimistic retry
+ per-repository serialization/queue
```

禁止用 force push 解决冲突。

## 11. GitHub Authentication

开发：

```text
GITHUB_TOKEN
```

仅作为 fallback。

生产：

```text
GitHub App
→ installation_id
→ installation access token
→ repository-scoped write
```

Token：

- 短期使用。
- 不长期落库。
- 不打印日志。

`set_asset_repository` 必须确认目标 repo 在用户 installation 授权范围内。

## 12. Source URL security

当前 `sourceUrl` 接口是生产化高优先级风险点。

正式 loader 必须：

```text
URL parse
→ HTTPS/allowed scheme
→ DNS resolve
→ reject private/link-local/loopback/metadata network
→ fetch with timeout + size cap
→ validate redirects again
→ validate Content-Type
→ return bytes
```

不能让工具访问：

```text
localhost
private VPC
cloud metadata
internal admin services
```

大文件正式方案优先 signed URL/stream，不把多 MB base64 JSON 作为主通道。

## 13. Initial vs Incremental vs Live

### Initial

一次性历史迁移。当前用户已经完成。

### Incremental

```text
lastLibraryCreatedAt
→ scan bounded range
→ process all
→ only advance cursor when run is safely completed
```

### Live

```text
host gives generated asset
→ resolve project
→ sync_asset
```

不使用 cron 冒充 live。

## 14. Host Adapter boundary

当前 ChatGPT 原生生成器没有为本项目提供一个可以假设存在的全局 `image_generated` hook。

因此：

```text
ChatGPT platform-specific capability
            │
            ▼
       Host Adapter
            │
            ▼
    Stable sync pipeline
```

未来平台能力变化时只替换/新增 Host Adapter，不重写 GitHub、去重、项目路由、状态机。

详细 contract 见：`docs/HOST_BRIDGE.md`。

## 15. Remote MCP

目标：

```text
https://<service-domain>/mcp
```

生产优先 request-scoped/stateless transport，避免依赖 serverless instance memory。

核心业务保持 provider-agnostic；Vercel 只是首选部署 adapter。

## 16. Security trust boundaries

```text
Model input              = untrusted
sourceUrl                = untrusted
filename/project text     = untrusted
repository selection      = validate against installation
OAuth auth context        = trusted identity after verification
GitHub installation token = secret
asset bytes               = untrusted binary input
```

所有路径、URL、目标 repository、用户作用域都必须 server-side 验证。

## 17. 设计目标

整个系统应保持以下恢复能力：

即使数据库丢失，只要 GitHub 资产仓库仍存在，也能通过：

```text
.chatgpt-asset-sync/index/
asset sidecars
initial sync state
```

重建绝大部分同步状态。

因此数据库负责身份、配置、运行状态和检索；GitHub 仍是永久资产归档层。
