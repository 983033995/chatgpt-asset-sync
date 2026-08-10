import cors from "cors";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ConfigStore } from "./config/store.js";
import { AssetSyncService } from "./services/asset-sync.js";
import { InitialSyncStore } from "./services/initial-sync-store.js";
import { resolveProject } from "./services/project-router.js";
import type { LibraryImportBatchResult } from "./types/assets.js";

const PORT = Number(process.env.PORT || 8787);
const SERVER_VERSION = "0.4.0";
const configStore = new ConfigStore(process.env.CONFIG_STORE_PATH || "./data/configs.json");
const initialSyncStore = new InitialSyncStore(process.env.INITIAL_SYNC_STORE_PATH || "./data/initial-sync.json");
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
    "get_initial_sync_status",
    {
      title: "Get initial asset sync status",
      description: "Return whether the ChatGPT Library bootstrap sync is idle, awaiting export, bundle-ready, importing, completed, or failed.",
      inputSchema: { profileId: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ profileId }) => {
      const state = await initialSyncStore.get(profileId);
      return { content: [{ type: "text", text: JSON.stringify(state) }], structuredContent: state };
    },
  );

  server.registerTool(
    "begin_initial_sync",
    {
      title: "Begin initial ChatGPT Library sync",
      description: "Start or restart the one-time Library bootstrap workflow. The ChatGPT host should enumerate model-generated Library assets, then register/export a migration bundle or provide batches directly.",
      inputSchema: {
        profileId: z.string().optional(),
        migrationId: z.string().optional(),
        discoveredAssets: z.number().int().nonnegative().optional(),
        lastLibraryCreatedAt: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const state = await initialSyncStore.begin(input);
      const result = {
        ...state,
        nextAction: "Enumerate Library with model_generated=true. Prefer a host file transfer to the Asset Sync service; otherwise prepare a verified migration bundle.",
      };
      return { content: [{ type: "text", text: `Initial sync ${state.migrationId} started.` }], structuredContent: result };
    },
  );

  server.registerTool(
    "register_initial_sync_bundle",
    {
      title: "Register initial sync migration bundle",
      description: "Record a verified migration bundle produced by the ChatGPT host before importing it. This does not itself transfer the bundle bytes.",
      inputSchema: {
        profileId: z.string().optional(),
        filename: z.string().min(1),
        assetCount: z.number().int().nonnegative(),
        totalBytes: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ profileId, filename, assetCount, totalBytes, sha256 }) => {
      const state = await initialSyncStore.registerBundle(profileId, {
        filename,
        assetCount,
        totalBytes,
        sha256: sha256.toLowerCase(),
        createdAt: new Date().toISOString(),
      });
      return { content: [{ type: "text", text: `Migration bundle registered: ${filename}.` }], structuredContent: state };
    },
  );

  server.registerTool(
    "complete_initial_sync",
    {
      title: "Complete initial asset sync",
      description: "Mark the bootstrap sync complete after the destination GitHub commit succeeds. Future runs can use lastLibraryCreatedAt for incremental discovery.",
      inputSchema: {
        profileId: z.string().optional(),
        assetCount: z.number().int().nonnegative(),
        lastLibraryCreatedAt: z.string().optional(),
        commitSha: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const state = await initialSyncStore.complete(input);
      return { content: [{ type: "text", text: `Initial sync completed with ${input.assetCount} assets.` }], structuredContent: state };
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
      description: "Return the bootstrap import contract and current lifecycle state. The host enumerates model-generated Library files and supplies a host file transfer, downloadable URL, or bytes.",
      inputSchema: { profileId: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ profileId }) => {
      const config = await configStore.get(profileId);
      const state = await initialSyncStore.get(profileId);
      const result = {
        ready: true,
        version: SERVER_VERSION,
        repository: config.repository,
        batchSize: 20,
        state,
        requiredHostCapability: "Provide generated Library files using a host file parameter or temporary sourceUrl; dataBase64 is a fallback for small assets.",
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
      description: "Import up to 20 model-generated Library assets. Designed for resumable bootstrap migration and uses the same SHA256 deduplication path as live sync.",
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
      const state = await initialSyncStore.recordBatch(profileId, report);

      return {
        content: [{ type: "text", text: `Migration ${migrationId}: ${synced} synced, ${duplicates} duplicates, ${failed} failed.` }],
        structuredContent: { ...report, state },
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
