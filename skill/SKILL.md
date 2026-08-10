# ChatGPT Asset Sync — Workflow Skill

## Purpose

将 ChatGPT 中生成的 AI 资产同步到用户配置的 GitHub 资产仓库。包含首次 Library 初始化迁移和后续生成资产实时归档。

## 用户入口

用户可以直接说：

- `初始化资产同步`
- `同步我的 ChatGPT 资产`
- `修改资产同步仓库`
- `查看资产同步状态`

不要要求用户了解 file_id、SHA256、manifest、migration bundle 或 GitHub tree/blob。

## 初始化工作流

当用户要求初始化资产同步时：

1. 调用 `get_initial_sync_status`。
2. 如果 `phase=completed`：
   - 不重新做完整历史迁移。
   - 使用 `lastLibraryCreatedAt` 作为增量发现游标，只寻找更新的 `model_generated=true` 资产。
3. 如果尚未初始化：
   - 调用 `begin_initial_sync`。
   - 枚举 ChatGPT Library 中 `model_generated=true` 的图片/资产。
   - 排除用户上传的参考图片。
   - 优先按 ChatGPT Project / Library folder / 已保存映射识别项目。
   - 低置信度资产进入 `_unclassified`，不得为了分类而丢弃资产。
4. 宿主如果可以把原始文件直接交给 App/MCP：
   - 优先使用宿主文件参数或临时 `sourceUrl`。
   - 分批调用 `import_library_batch`，每批最多 20 个。
5. 宿主暂时无法直接传文件时：
   - 生成经过 SHA256 校验的 migration bundle。
   - 调用 `register_initial_sync_bundle` 登记 bundle。
   - 明确告诉用户仍需把 bundle 交给 Migration Runner；不得声称已经上传到 GitHub。
6. 目标 GitHub commit 确认成功后调用 `complete_initial_sync`，保存：
   - assetCount
   - lastLibraryCreatedAt
   - commitSha

## 实时同步工作流

1. 优先识别当前 ChatGPT Project；否则使用明确项目名；再否则使用对话标题。
2. 当生成资产的 bytes、宿主文件参数、base64 或可访问 source URL 已可用时，调用 `sync_asset`。
3. 不要求用户手动下载后再上传。
4. `sync_asset` 成功后才可以说“已同步/已归档”。
5. 如果宿主没有把原生生成资产交给工具，不得假装同步成功；明确说明当前附件没有暴露给同步工具。
6. 同一资产由服务端 SHA256 去重，不要因为文件名变化而重复归档。
7. 用户修改目标仓库时，调用 `set_asset_repository`，不要要求修改源码。

## Project resolution

优先级：

1. 用户明确指定的 project
2. 当前 ChatGPT Project / Library folder
3. 已建立的 Conversation → Project 映射
4. 对话标题 / 高置信度内容分类
5. `_unclassified`

## Safety / Truthfulness

- 生成 migration bundle ≠ GitHub 同步完成。
- 只有目标仓库中的 asset + metadata + SHA256 index 已写入后，才能报告同步成功。
- 初始化失败或被中断时必须保留进度并支持恢复，不应重新上传已经建立 SHA256 index 的资产。
