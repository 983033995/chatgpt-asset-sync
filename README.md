# ChatGPT Asset Sync

把 ChatGPT 中生成的图片/资产同步到用户自定义的 GitHub 资产仓库，并按项目自动归档。

> 当前仓库是 v0.1 初始化版本：先建立“资产同步底座 + 首次全量迁移入口 + ChatGPT Plugin/App MCP 工具”。ChatGPT 目前没有公开全局 `image_generated` 事件，因此“任意端任意原生图片生成后 100% 无感触发”仍取决于后续 ChatGPT 宿主能力。

## 目标

- 首次把 ChatGPT Library 中历史生成资产全量同步到 GitHub。
- 后续在 ChatGPT 工作流能够拿到生成资产时，立即调用 `sync_asset` 同步，而不是定时轮询。
- 同步目标仓库完全可配置，不绑定 `openmontage-assets`。
- 支持按项目归档、SHA256 去重、元数据记录。
- 为 ChatGPT Plugin / Apps SDK / MCP 形态预留正式入口。

## 自定义目标仓库

支持以下两种格式：

```text
983033995/openmontage-assets
https://github.com/983033995/openmontage-assets
```

可配置：

```text
repository  GitHub owner/repo 或完整 URL
branch      默认 main
basePath    默认 projects
```

运行时通过 MCP 工具修改：

```text
set_asset_repository
```

也可以通过环境变量提供默认值：

```bash
ASSET_REPOSITORY=983033995/openmontage-assets
ASSET_BRANCH=main
ASSET_BASE_PATH=projects
```

## 资产目录约定

```text
<asset-repository>/
├── projects/
│   └── <project>/
│       └── 2026-08-10/
│           ├── image.png
│           └── image.png.json
└── .chatgpt-asset-sync/
    └── index/
        └── <sha256>.json
```

`.chatgpt-asset-sync/index/<sha256>.json` 用于无冲突去重，避免维护一个越来越大的中央 manifest。

## MCP 工具

| 工具 | 用途 |
|---|---|
| `get_sync_config` | 查询当前目标仓库 |
| `set_asset_repository` | 设置/切换目标仓库、分支、根目录 |
| `resolve_project` | 解析归档项目 |
| `sync_asset` | 同步一张资产并生成 metadata/index |
| `import_library` | 首次 Library 全量导入入口（v0.1 contract） |

## 本地启动

```bash
cp .env.example .env
npm install
npm run start
```

MCP endpoint：

```text
http://localhost:8787/mcp
```

健康检查：

```text
GET http://localhost:8787/health
```

## GitHub 鉴权

v0.1 使用：

```bash
GITHUB_TOKEN=...
```

生产版本不建议把个人 PAT 当作长期方案，后续会切换为 GitHub App / OAuth，并按 ChatGPT 用户隔离目标仓库配置。

## 项目识别优先级

```text
显式 project
  ↓
ChatGPT Project 名称
  ↓
当前对话标题
  ↓
_unclassified
```

后续会增加 Conversation → Project 映射与 AI 高置信度分类。

## 路线图

详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 官方实现基线

服务端结构参考 OpenAI 官方 `openai/openai-apps-sdk-examples` 的 Node MCP 示例，采用 Streamable HTTP + `@modelcontextprotocol/sdk`。

## License

MIT

## 发布这个程序仓库

如果本机已经登录 GitHub CLI，可以直接：

```bash
./scripts/publish-github.sh 983033995/chatgpt-asset-sync public
```

如果希望建成私有仓库，把最后一个参数改为 `private`。

## 快速切换默认资产仓库

```bash
./scripts/configure-default.sh https://github.com/983033995/openmontage-assets main projects
```

这只是默认配置；运行后仍可通过 `set_asset_repository` 动态修改，无需重新部署代码。
