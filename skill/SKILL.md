# ChatGPT Asset Sync — Workflow Skill Draft

## Purpose

将当前对话中生成或用户明确要求归档的 AI 资产同步到用户配置的 GitHub 资产仓库。

## Workflow

1. 优先识别当前 ChatGPT Project；否则使用明确项目名；再否则使用对话标题。
2. 当生成资产的 bytes、base64 或可访问 source URL 已可用时，调用 `sync_asset`。
3. 不要求用户手动下载后再上传。
4. `sync_asset` 成功后才可以说“已同步/已归档”。
5. 如果宿主没有把原生生成资产交给工具，不得假装同步成功；明确说明当前附件没有暴露给同步工具。
6. 同一资产由服务端 SHA256 去重，不要因为文件名变化而重复归档。
7. 用户修改目标仓库时，调用 `set_asset_repository`，不要要求修改源码。

## Project resolution

优先级：

1. 用户明确指定的 project
2. 当前 ChatGPT Project
3. 已建立的 Conversation → Project 映射
4. 对话标题
5. `_unclassified`
