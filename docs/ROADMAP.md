# Roadmap

> 当前代码版本：`v0.4.0`
>
> 2026-08-10：首次历史 Library 迁移已经真实完成，88 张模型生成资产已写入 `983033995/openmontage-assets`，导入 commit：`83ddbe0fec1fc3deedf10375765a0abd5fc2014b`。
>
> 后续实施细节以 `docs/CODEX_HANDOFF.md` 为主。

## v0.1 — 同步底座 ✅

- [x] TypeScript MCP Server
- [x] 自定义 GitHub 目标仓库
- [x] branch / basePath 配置
- [x] GitHub binary asset upload
- [x] SHA256 去重
- [x] 项目路由基础规则
- [x] sidecar metadata
- [x] ChatGPT Skill 工作流草案

## v0.2 — Library 批量迁移协议 ✅

- [x] Library generated-asset inventory
- [x] `sourceFileId / sourceSurface`
- [x] `import_library_batch`
- [x] 可恢复批次清单
- [x] 基础历史项目分类
- [x] `_unclassified` fallback

## v0.3 — Migration Runner ✅

- [x] 原始资产 migration bundle
- [x] manifest + SHA256 校验
- [x] `npm run import:migration`
- [x] Git Database API 批量单 commit
- [x] 已索引 SHA256 跳过
- [x] 88 张历史资产首次真实导入完成

## v0.4 — Initialization State ✅

- [x] initial sync state machine
- [x] `get_initial_sync_status`
- [x] `begin_initial_sync`
- [x] `register_initial_sync_bundle`
- [x] `complete_initial_sync`
- [x] `lastLibraryCreatedAt` 基线
- [x] 资产仓库初始化完成状态文件

当前历史同步基线：

```text
assetCount: 88
lastLibraryCreatedAt: 2026-08-10T02:07:59.594373Z
importCommitSha: 83ddbe0fec1fc3deedf10375765a0abd5fc2014b
```

---

## v0.5 — Remote MCP + Production Persistence ⏭️

### Stabilize

- [ ] 引入 Vitest
- [ ] repository/basePath/path tests
- [ ] project routing tests
- [ ] SHA256 dedupe tests
- [ ] initial sync state tests
- [ ] ConfigStore port/interface
- [ ] InitialSyncStore port/interface
- [ ] GitHub storage/auth port boundary

### Persistence

- [ ] Postgres schema
- [ ] users
- [ ] sync_configs
- [ ] sync_states
- [ ] sync_runs
- [ ] conversation_project_mappings
- [ ] optional assets index table
- [ ] DB migrations
- [ ] Postgres store adapters
- [ ] local JSON adapters retained for development

### Remote MCP

- [ ] HTTPS Remote MCP entrypoint
- [ ] `/health`
- [ ] staging deployment
- [ ] request-scoped MCP transport
- [ ] authenticated user context plumbing
- [ ] deployment documentation

### v0.5 exit criteria

- [ ] `npm run check` passes
- [ ] staging Remote MCP reachable
- [ ] read-only MCP smoke test works
- [ ] staging `sync_asset` writes asset + metadata + index
- [ ] retry does not duplicate asset

---

## v0.6 — GitHub App Authentication

- [ ] Register GitHub App
- [ ] Contents read/write minimal permission
- [ ] install/setup flow
- [ ] persist `installation_id`
- [ ] installation access token provider
- [ ] repository picker/list API
- [ ] validate destination repository belongs to installation
- [ ] remove production PAT dependency
- [ ] installation/repository-change webhook
- [ ] reconnect-required state

### Security changes

- [ ] production tool schemas stop trusting model-provided `profileId`
- [ ] `sync_asset` no longer accepts arbitrary destination override
- [ ] user identity comes from authenticated MCP context

---

## v0.7 — Apps SDK Settings UI

- [ ] status card
- [ ] GitHub connection state
- [ ] repository picker
- [ ] branch/basePath settings
- [ ] initialization status
- [ ] latest sync status
- [ ] manual sync action
- [ ] `_unclassified` count/review entry

---

## v0.8 — Incremental Sync + Project Mapping

- [ ] cursor-based incremental sync after `lastLibraryCreatedAt`
- [ ] fixed scan upper-bound per sync run
- [ ] failed-run resume
- [ ] Conversation → Project persistence
- [ ] project mapping management
- [ ] AI classifier as low-priority fallback only
- [ ] `_unclassified` review/reclassify
- [ ] sync reports

---

## v0.9 — Production Hardening

- [ ] sourceUrl SSRF protection
- [ ] redirect/DNS validation
- [ ] asset MIME/size limits
- [ ] request timeout
- [ ] GitHub API retry/backoff
- [ ] repository write concurrency control
- [ ] structured logs
- [ ] token/URL redaction
- [ ] multi-user isolation tests
- [ ] staging/prod separation
- [ ] security review
- [ ] E2E tests

---

## v1.0 — Native Generated-Asset Adapter

依赖 ChatGPT 宿主提供真实可用的生成资产事件/附件交接能力。

只有满足以下条件才标记完成：

- [ ] native generated-asset attachment/event is actually available
- [ ] generated asset can be passed to App/MCP without manual download
- [ ] image generation completion can trigger `sync_asset`
- [ ] no cron/polling substitution
- [ ] intended Web/Desktop/Mobile behavior is verified on surfaces actually supported by OpenAI
- [ ] image/video/audio unified asset contract where platform supports them

如果 OpenAI 平台仍未提供该能力，保持 Host Adapter boundary，不伪造完成状态。
