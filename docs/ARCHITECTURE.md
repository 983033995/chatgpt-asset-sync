# Architecture

## 核心链路

```text
ChatGPT / Import Runner
        │
        ▼
MCP: sync_asset
        │
        ├─ Destination Config Resolver
        ├─ Project Router
        ├─ Asset Loader
        ├─ SHA256 Deduper
        └─ GitHub Storage
                 │
                 ▼
        Custom Asset Repository
```

## 为什么目标仓库必须可配置

同步服务自身仓库与资产仓库是两个独立概念：

- `chatgpt-asset-sync`：程序代码。
- Asset Repository：实际图片/视频/音频资产存储位置。

因此任何用户都可以配置：

```text
owner/assets-repo
branch
basePath
```

而无需 fork 后修改源码。

## 配置隔离

v0.1 使用 `profileId -> repository config` 的文件存储接口。
生产版本应替换成鉴权用户 ID + 数据库，并由 OAuth 身份决定配置作用域，禁止信任模型传入的任意 profileId。

## 去重策略

资产 bytes 计算 SHA256：

```text
.chatgpt-asset-sync/index/<sha256>.json
```

如果 index 已存在，则视为已归档，不重复上传。

## 当前宿主限制

项目本身采用事件驱动接口，不做定时轮询。但 ChatGPT 原生生成器当前没有公开全局 `image_generated` hook，因此 v0.1 的 `sync_asset` 需要由 ChatGPT 工作流、Library 首次导入 runner 或未来宿主事件触发。
