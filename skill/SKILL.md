# ChatGPT Asset Sync — Workflow Skill Draft

## Purpose

将当前对话中生成或用户明确要求归档的 AI 资产同步到用户配置的 GitHub 资产仓库；首次启用时支持 ChatGPT Library 历史生成资产的批量迁移。

## Live sync workflow

1. 优先识别当前 ChatGPT Project；否则使用明确项目名；再否则使用 Conversation → Project 映射和对话标题。
2. 图片/资产生成完成后，如果宿主已经提供可访问的 `sourceUrl`、文件载荷或兼容的 base64，则在同一工作流立即调用 `sync_asset`。
3. 不使用定时轮询，不要求用户手动下载再上传。
4. `sync_asset` 成功后才可以说“已同步/已归档”。
5. 如果宿主没有把原生生成资产暴露给同步工具，不得假装同步成功。
6. 同一资产由服务端 SHA256 去重，文件名变化不能导致重复归档。
7. 用户修改目标仓库时调用 `set_asset_repository`，不要要求修改源码。

## First Library import

1. 调用 `import_library` 获取当前目标仓库和导入契约。
2. 枚举 Library，只选 `model_generated=true` 的资产，排除用户上传参考图。
3. 为每项保留 `sourceFileId`，并尽量提供 `filename`、`mimeType`、`generatedAt`、`chatgptProject`、`conversationTitle`。
4. 按最多 20 项一批调用 `import_library_batch`。
5. 失败项可以单独重试；SHA256 索引保证整个迁移过程幂等、可恢复。
6. 任何无法可靠分类的资产进入 `_unclassified`，不能丢弃。

## Project resolution

优先级：

1. 用户明确指定的 project
2. 当前 ChatGPT Project / Library 路径
3. 已建立的 Conversation → Project 映射
4. 对话标题和高置信度内容分类
5. `_unclassified`

## Host requirement

正式的跨 Web / Desktop / Mobile 生成即同步依赖 ChatGPT 宿主把生成附件交给 App/MCP。详见 `docs/HOST_BRIDGE.md`。
