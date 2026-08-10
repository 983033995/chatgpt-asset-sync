import cors from "cors";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ConfigStore } from "./config/store.js";
import { AssetSyncService } from "./services/asset-sync.js";
import { resolveProject } from "./services/project-router.js";

const PORT = Number(process.env.PORT || 8787);
const configStore = new ConfigStore(process.env.CONFIG_STORE_PATH || "./data/configs.json");
const syncService = new AssetSyncService(configStore);

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "chatgpt-asset-sync", version: "0.1.0" });

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
      inputSchema: {
        profileId: z.string().optional(),
        repository: z.string().optional(),
        branch: z.string().optional(),
        basePath: z.string().optional(),
        project: z.string().optional(),
        conversationId: z.string().optional(),
        conversationTitle: z.string().optional(),
        chatgptProject: z.string().optional(),
        filename: z.string().optional(),
        mimeType: z.string().optional(),
        sourceUrl: z.string().url().optional(),
        dataBase64: z.string().optional(),
        prompt: z.string().optional(),
        generatedAt: z.string().optional(),
      },
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
      title: "Import ChatGPT Library assets",
      description: "Prepare a first-time full import. Host-side Library enumeration must provide the assets; this tool reports the current import contract.",
      inputSchema: { profileId: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ profileId }) => {
      const config = await configStore.get(profileId);
      const result = {
        ready: true,
        repository: config.repository,
        note: "v0.1 expects the ChatGPT host/import runner to enumerate Library images and call sync_asset for each item.",
      };
      return { content: [{ type: "text", text: result.note }], structuredContent: result };
    },
  );

  return server;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "chatgpt-asset-sync", version: "0.1.0" });
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
