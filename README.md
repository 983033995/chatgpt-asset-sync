# ChatGPT Asset Sync

把 ChatGPT 中生成的 AI 图片/资产同步到**用户自定义的 GitHub 仓库**，并按项目自动归档。

> 当前版本：**v0.4.0**。已经具备可配置目标仓库、单资产同步、Library 批量迁移、Migration Runner、SHA256 幂等去重，以及首次初始化同步状态机。最终“Web / Desktop / Mobile 任意原生图片生成后 100% 无感触发”仍取决于 ChatGPT 宿主开放生成附件事件/文件传输能力。

## 目标体验

用户只需要说：

```text
初始化资产同步
```

工作流目标：

```text
ChatGPT Library
      ↓
model_generated=true
      ↓
项目分类
      ↓
ChatGPT Asset Sync
      ↓
GitHub assets + metadata + SHA256 index
      ↓
保存初始化游标
```

初始化完成后，后续不再重新全量扫描；使用 `lastLibraryCreatedAt` + SHA256 做增量和去重。

## v0.4 已实现

- 自定义 GitHub 目标仓库：`owner/repo` 或完整 GitHub URL。
- 自定义 branch / basePath。
- `sync_asset`：单资产同步。
- `import_library_batch`：每批最多 20 个 Library 资产。
- `sourceFileId` / `sourceSurface` 来源追踪。
- SHA256 去重，可安全重试。
- sidecar metadata。
- `.chatgpt-asset-sync/index/<sha256>.json` 去重索引。
- Migration ZIP + `npm run import:migration` 一次性历史迁移。
- 初始化同步状态机：
  - `idle`
  - `awaiting-host-export`
  - `bundle-ready`
  - `importing`
  - `completed`
  - `failed`
- 初始化完成后保存 `lastLibraryCreatedAt` 和目标 commit SHA。

## MCP 工具

| 工具 | 用途 |
|---|---|
| `get_sync_config` | 查询目标 GitHub 仓库 |
| `set_asset_repository` | 修改仓库、分支、根目录 |
| `get_initial_sync_status` | 查询初始化状态 |
| `begin_initial_sync` | 开始首次 Library 初始化 |
| `register_initial_sync_bundle` | 登记 ChatGPT 生成的迁移包 |
| `import_library` | 获取 Library 导入契约和状态 |
| `import_library_batch` | 批量迁移 1–20 个资产 |
| `complete_initial_sync` | GitHub 写入成功后完成初始化 |
| `resolve_project` | 解析归档项目 |
| `sync_asset` | 同步单个新资产 |

## 自定义目标仓库

环境变量默认值：

```bash
ASSET_REPOSITORY=983033995/openmontage-assets
ASSET_BRANCH=main
ASSET_BASE_PATH=projects
```

运行时也可以直接调用：

```text
set_asset_repository
```

无需修改源码或重新构建。

## 第一次历史迁移

当前 ChatGPT 宿主如果还不能把个人 Library 文件直接交给第三方 MCP，则使用一次性 Migration Bundle：

```text
ChatGPT
  ↓
枚举 Library
  ↓
导出原始 PNG/JPG
  ↓
manifest + SHA256
  ↓
migration.zip
  ↓
Migration Runner
  ↓
GitHub
```

本地执行：

```bash
npm install
npm run import:migration -- /path/to/migration.zip --dry-run
npm run import:migration -- /path/to/migration.zip
```

Migration Runner 会：

1. 校验 manifest。
2. 校验每个原始文件 SHA256 和大小。
3. 检查目标仓库 SHA256 index。
4. 跳过已经同步的资产。
5. 创建图片、metadata、index blobs。
6. 基于目标仓库现有 tree 创建新 tree。
7. 一次 commit 写入全部待迁移资产。

## 初始化状态

服务端将状态保存在：

```text
./data/initial-sync.json
```

可通过环境变量修改：

```bash
INITIAL_SYNC_STORE_PATH=./data/initial-sync.json
```

完成后的状态示例：

```json
{
  "phase": "completed",
  "discoveredAssets": 88,
  "processedAssets": 88,
  "lastLibraryCreatedAt": "2026-08-10T02:07:59Z",
  "commitSha": "..."
}
```

以后再次执行“初始化资产同步”时，Skill 应先调用 `get_initial_sync_status`；如果已经完成，则只查 `lastLibraryCreatedAt` 之后的新资产。

## 目标资产结构

```text
<asset-repository>/
├── projects/
│   └── <project>/
│       └── YYYY-MM-DD/
│           ├── image.png
│           └── image.png.json
└── .chatgpt-asset-sync/
    ├── index/
    │   └── <sha256>.json
    └── migrations/
        └── YYYY-MM-DD/
```

## 项目识别优先级

```text
用户明确 project
  ↓
ChatGPT Project / Library folder
  ↓
Conversation → Project 映射
  ↓
对话标题 / 高置信度内容分类
  ↓
_unclassified
```

无法可靠分类的资产进入 `_unclassified`，不能为了分类而遗漏资产。

## 本地启动 MCP

```bash
cp .env.example .env
npm install
npm run start
```

MCP endpoint：

```text
POST http://localhost:8787/mcp
```

健康检查：

```text
GET http://localhost:8787/health
```

## GitHub 鉴权

开发版使用：

```bash
GITHUB_TOKEN=...
```

生产版计划切换 GitHub App / OAuth，并按 ChatGPT 用户隔离目标仓库配置。

## 当前平台边界

`ChatGPT Asset Sync` 已把“资产来源”和“同步服务”解耦：

```text
Asset Source
 ├── ChatGPT native image generation
 ├── ChatGPT Library
 ├── OpenAI API
 └── user upload
       ↓
Host Adapter
       ↓
ChatGPT Asset Sync
       ↓
GitHub
```

当前尚不能承诺任意普通 ChatGPT 对话、任意客户端中的原生生成图片都一定自动触发第三方同步工具。宿主文件通道开放后，只需实现/替换 Host Adapter，GitHub、分类、去重、初始化状态机不需要重写。

详见 `docs/HOST_BRIDGE.md`。

## License

MIT
