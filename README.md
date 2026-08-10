# ChatGPT Asset Sync

把 ChatGPT 中生成的图片/资产同步到**用户自定义的 GitHub 资产仓库**，按项目自动归档。

> v0.2 已建立：可配置目标仓库 + 单资产实时同步 + Library 批量迁移协议 + SHA256 幂等去重。最终“手机 / Desktop / Web 任意原生图片生成后 100% 无感触发”仍取决于 ChatGPT 宿主开放生成附件事件/文件传输能力。

## 当前状态

### ✅ 已实现

- 目标 GitHub 仓库可运行时修改，不绑定 `openmontage-assets`。
- 支持 `owner/repo` 或完整 GitHub URL。
- 自定义 branch / basePath。
- `sync_asset`：单资产生成后立即归档。
- `sourceFileId` / `sourceSurface` 元数据追踪。
- `import_library_batch`：首次 Library 导入，每批最多 20 张。
- SHA256 去重，可安全重试、断点续传。
- 自动项目归档 + `_unclassified` 兜底。
- sidecar metadata + `.chatgpt-asset-sync/index/<sha256>.json`。

### 🟡 首次迁移进度

2026-08-10 已完成用户 Library 盘点：

- 图片文件总数：约 200
- 确认 `model_generated=true`：**88 张**
- 时间范围：2026-05-14 ～ 2026-08-10
- 用户上传的参考图：排除，不进入自动迁移
- 已识别项目包括 PageMind、CRM 发票、Codex Dream Skin、Wuxia Comic、Mia USA、都市爽文韩漫、表情包等
- 迁移 inventory 已写入目标资产仓库 `.chatgpt-asset-sync/migrations/2026-08-10/inventory.json`

当前剩余阻塞是 **ChatGPT 私有 Library 文件 → 第三方 MCP 服务的二进制传输**：现有 GitHub ChatGPT Connector 只支持二进制经 base64 blob 写入，不适合 88 张多 MB 原图的正式迁移。v0.2 已把这一层隔离为 Host Bridge；一旦宿主提供附件 URL/文件参数即可直接批量导入。

## 自定义目标仓库

支持：

```text
983033995/openmontage-assets
https://github.com/983033995/openmontage-assets
```

环境变量默认值：

```bash
ASSET_REPOSITORY=983033995/openmontage-assets
ASSET_BRANCH=main
ASSET_BASE_PATH=projects
```

运行时可通过 MCP 工具修改，无需重新部署：

```text
set_asset_repository
```

## MCP 工具

| 工具 | 用途 |
|---|---|
| `get_sync_config` | 查询当前目标仓库 |
| `set_asset_repository` | 设置/切换目标仓库、分支、根目录 |
| `resolve_project` | 解析归档项目 |
| `sync_asset` | 同步一张资产并生成 metadata/index |
| `import_library` | 获取首次 Library 导入契约 |
| `import_library_batch` | 批量迁移 1–20 个 Library 资产 |

## Library 全量迁移

```text
ChatGPT Library
      ↓
model_generated=true
      ↓
项目识别
      ↓
每批 ≤ 20
      ↓
import_library_batch
      ↓
SHA256 去重
      ↓
GitHub assets + metadata + index
```

每个资产建议提供：

```json
{
  "sourceFileId": "file_xxx",
  "sourceSurface": "library",
  "project": "pagemind",
  "filename": "image.png",
  "mimeType": "image/png",
  "generatedAt": "2026-08-10T02:07:59Z",
  "sourceUrl": "<host-provided temporary URL>"
}
```

如果宿主不能提供 `sourceUrl`，兼容回退为 `dataBase64`，但不建议用于大批量原图。

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
            └── inventory.json
```

## 项目识别优先级

```text
显式 project
  ↓
ChatGPT Project / Library path
  ↓
Conversation → Project 映射
  ↓
对话标题 / 高置信度内容分类
  ↓
_unclassified
```

## 本地启动

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

生产版计划切换 GitHub App / OAuth，并按 ChatGPT 用户隔离目标仓库配置，不把个人 PAT 作为长期方案。

## Host Bridge

跨 Web / Desktop / Mobile 的最终入口设计见 [docs/HOST_BRIDGE.md](docs/HOST_BRIDGE.md)。

核心原则：

```text
ChatGPT = 资产来源
Host Adapter = 把生成附件交给同步服务
ChatGPT Asset Sync = 分类 / 去重 / 写入
GitHub = 永久资产库
```

不采用浏览器 DOM 插件，也不采用定时轮询。

## 官方实现基线

MCP 服务端结构参考 OpenAI 官方 Node MCP / Apps SDK 示例，采用 Streamable HTTP + `@modelcontextprotocol/sdk`。

## License

MIT
