# Host Bridge contract (v0.2)

ChatGPT Asset Sync 的同步服务只负责：目标仓库配置、项目路由、下载/接收资产、SHA256 去重、GitHub 写入和 metadata/index。

真正做到“Library 全量迁移”和未来“生成即同步”，宿主必须把 ChatGPT 资产交给 MCP 服务。

## 首次 Library 导入

1. ChatGPT 宿主枚举 Library 图片。
2. 只选择 `model_generated=true`。
3. 每个资产保留 `sourceFileId`、文件名、MIME、生成时间、Library Project/路径（如果存在）。
4. 宿主提供以下任一种可读取的载荷：
   - `sourceUrl`: MCP 服务端能够直接 GET 的临时/签名 URL；或
   - `dataBase64`: 仅作为兼容回退，不建议用于大批量图片。
5. 每 1–20 张调用一次 `import_library_batch`。
6. 服务端以 SHA256 和 `.chatgpt-asset-sync/index/<sha256>.json` 保证幂等，因此可以安全重试。
7. 低置信度项目进入 `_unclassified`，不能丢弃。

## 实时生成同步

理想宿主事件：

```text
image generation completed
  -> expose generated file/attachment
  -> resolve project
  -> sync_asset
  -> GitHub commit
```

同步必须发生在图片生成完成的同一工作流中，不依赖 cron/定时扫描。

## 当前 ChatGPT 能力边界

截至 2026-08-10，ChatGPT 没有公开全局 `image_generated` webhook，也没有公开把任意原生 Library 私有 `file_id` 交给第三方 MCP 服务端直接下载的通用接口。

因此 v0.2 把“宿主文件传输”做成 Adapter 边界：一旦 ChatGPT 向 Plugin/App 暴露生成附件的可下载 URL/文件参数，只需实现 Host Adapter，GitHub、去重、分类和迁移协议均无需重写。

## 不采用的方案

- 浏览器 DOM 插件：无法覆盖手机 App / Desktop App。
- 定时轮询：不符合生成即同步目标。
- 把多 MB 图片逐张塞进模型 JSON/base64：可以作为测试回退，但不适合作为正式全量迁移通道。
