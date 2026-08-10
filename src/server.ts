import cors from "cors";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ConfigStore } from "./config/store.js";
import { AssetSyncService } from "./services/asset-sync.js";
import { resolveProject } from "./services/project-router.js";
import type { LibraryImportBatchResult } from "./types/assets.js";

const PORT = Number(process.env.PORT || 8787);
const SERVER_VERSION = "0.2.0";
const configStore = new ConfigStore(process.env.CONFIG_STORE_PATH || "./data/configs.json");
const syncService = new AssetSyncService(configStore);

const assetInputSchema = {
  repository: z.string().optional(),
  branch: z.string().optional(),
  basePath: z.string().optional(),
  project: z.string().optional(),
  conversationId: z.string().optional(),
  conversationTitle: z.string().optional(),
  chatgptProject: z.string().optional(),
  sourceFileId: z.string().optional(),
  sourceSurface: z.enum(["library", "conversation", "api", "upload"]).optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  dataBase64: z.string().optional(),
  prompt: z.string().optional(),
  generatedAt: z.string().optional(),
};

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "chatgpt-asset-sync", version: SERVER_VERSION });

  server.registerTool(
    "get_sync_config",
    {
      title: "Get asset sync configuration",
      description: "Read the configured destination GitHub repository, branch, and base path.",
      inputSchema: { profileId: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ profileId }) => {
      const config = await configStore.get(profileId);
      return { content: [{ type: "text", text: JSON.stringify(config) }], structuredContent: config };
    },
  );

  server.registerTool(
    "set_asset_repository",
    {
      title: "Set asset destination repository",
      description: "Set or change the GitHub repository used for synchronized assets. Accepts owner/repo or a GitHub URL.",
      inputSchema: {
        profileId: z.string().optional(),
        repository: z.string(),
        branch: z.string().default("main"),
        basePath: z.string().default("projects"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ profileId, repository, branch, basePath }) => {
      const config = await configStore.set(profileId, { repository, branch, basePath });
      return { content: [{ type: "text", text: `Asset repository set to ${config.repository}.` }], structuredContent: config };
    },
  );

  server.registerTool(
    "resolve_project",
    {
      title: "Resolve asset project",
      description: "Resolve which project folder an asset should use from explicit project, ChatGPT project, or conversation title.",
      inputSchema: {
        project: z.string().optional(),
        chatgptProject: z.string().optional(),
        conversationTitle: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const project = resolveProject(input);
      return { content: [{ type: "text", text: project }], structuredContent: { project } };
    },
  );

  server.registerTool(
    "sync_asset",
    {
      title: "Sync generated asset",
      description: "Synchronize one generated or uploaded asset to the configured GitHub asset repository and archive it by project.",
      inputSchema: { profileId: z.string().optional(), ...assetInputSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      const result = await syncService.sync(input);
      const text = result.duplicate
        ? `Asset already archived: ${result.assetPath}`
        : `Asset synchronized: ${result.repository}/${result.assetPath}`;
      return { content: [{ type: "text", text }], structuredContent: result };
    },
  );

  server.registerTool(
    "import_library",
    {
      title: "Prepare ChatGPT Library import",
      description: "Return the v0.2 first-import contract. The host enumerates model-generated Library files and supplies a downloadable URL or bytes to import_library_batch.",
      inputSchema: { profileId: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ profileId }) => {
      const config = await configStore.get(profileId);
      const result = {
        ready: true,
        version: SERVER_VERSION,
        repository: config.repository,
        batchSize: 20,
        requiredHostCapability: "For each Library item provide sourceUrl or dataBase64 plus sourceFileId.",
        includePolicy: "model_generated=true",
        idempotency: "SHA256 index in .chatgpt-asset-sync/index/",
        fallbackProject: "_unclassified",
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    },
  );

  server.registerTool(
    "import_library_batch",
    {
      title: "Import a ChatGPT Library batch",
      description: "Import up to 20 model-generated Library assets. Designed for resumable first-time migration and uses the same SHA256 deduplication path as live sync.",
      inputSchema: {
        profileId: z.string().optional(),
        migrationId: z.string().min(1),
        assets: z.array(z.object(assetInputSchema)).min(1).max(20),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ profileId, migrationId, assets }) => {
      const results: LibraryImportBatchResult["results"] = [];
      let synced = 0;
      let duplicates = 0;
      let failed = 0;

      for (const asset of assets) {
        try {
          const result = await syncService.sync({ ...asset, profileId, sourceSurface: asset.sourceSurface ?? "library" });
          if (result.duplicate) duplicates += 1;
          else synced += 1;
          results.push({ sourceFileId: asset.sourceFileId, ok: true, result });
        } catch (error) {
          failed += 1;
          results.push({
            sourceFileId: asset.sourceFileId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const report: LibraryImportBatchResult = {
        migrationId,
        processed: assets.length,
        synced,
        duplicates,
        failed,
        results,
      };

      return {
        content: [{ type: "text", text: `Migration ${migrationId}: ${synced} synced, ${duplicates} duplicates, ${failed} failed.` }],
        structuredContent: report,
      };
    },
  );

  return server;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "chatgpt-asset-sync", version: SERVER_VERSION });
});

app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`ChatGPT Asset Sync MCP server listening on http://localhost:${PORT}/mcp`);
});
