import { createHash } from "node:crypto";
import path from "node:path";
import type { AssetRepositoryConfig, AssetSyncInput, AssetSyncResult } from "../types/assets.js";
import { ConfigStore } from "../config/store.js";
import { GitHubClient } from "../github/client.js";
import { normalizeBasePath, normalizeRepository } from "../utils/repository.js";
import { safeFilename } from "../utils/slug.js";
import { loadAssetBytes } from "./asset-loader.js";
import { resolveProject } from "./project-router.js";

export class AssetSyncService {
  constructor(private readonly configStore: ConfigStore) {}

  async sync(input: AssetSyncInput): Promise<AssetSyncResult> {
    const stored = await this.configStore.get(input.profileId);
    const config = mergeConfig(stored, input);
    const client = new GitHubClient(process.env.GITHUB_TOKEN || "");
    const bytes = await loadAssetBytes(input);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const project = resolveProject(input);
    const generatedAt = input.generatedAt ? new Date(input.generatedAt) : new Date();
    const date = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
    const day = date.toISOString().slice(0, 10);
    const ext = extensionFor(input.mimeType, input.filename);
    const filename = safeFilename(input.filename || `${sha256.slice(0, 12)}${ext}`);

    const assetPath = joinRepoPath(config.basePath, project, day, filename);
    const metadataPath = `${assetPath}.json`;
    const indexPath = joinRepoPath(".chatgpt-asset-sync", "index", `${sha256}.json`);

    if (await client.getContent(config.repository, indexPath, config.branch)) {
      return {
        synced: true,
        duplicate: true,
        repository: config.repository,
        branch: config.branch,
        project,
        assetPath,
        metadataPath,
        sha256,
        reason: "Asset SHA256 already exists in the destination index.",
      };
    }

    await client.putFile({
      repository: config.repository,
      branch: config.branch,
      path: assetPath,
      contentBase64: bytes.toString("base64"),
      message: `assets: sync ${filename}`,
    });

    const metadata = {
      schemaVersion: 1,
      source: "chatgpt",
      sha256,
      project,
      repository: config.repository,
      branch: config.branch,
      assetPath,
      conversationId: input.conversationId ?? null,
      conversationTitle: input.conversationTitle ?? null,
      chatgptProject: input.chatgptProject ?? null,
      prompt: input.prompt ?? null,
      generatedAt: date.toISOString(),
      syncedAt: new Date().toISOString(),
      mimeType: input.mimeType ?? null,
    };

    const metadataBase64 = Buffer.from(JSON.stringify(metadata, null, 2) + "\n").toString("base64");
    await client.putFile({
      repository: config.repository,
      branch: config.branch,
      path: metadataPath,
      contentBase64: metadataBase64,
      message: `assets: add metadata for ${filename}`,
    });

    await client.putFile({
      repository: config.repository,
      branch: config.branch,
      path: indexPath,
      contentBase64: Buffer.from(JSON.stringify({ sha256, assetPath, metadataPath, project }, null, 2) + "\n").toString("base64"),
      message: `assets: index ${sha256.slice(0, 12)}`,
    });

    return {
      synced: true,
      duplicate: false,
      repository: config.repository,
      branch: config.branch,
      project,
      assetPath,
      metadataPath,
      sha256,
    };
  }
}

function mergeConfig(stored: AssetRepositoryConfig, input: AssetSyncInput): AssetRepositoryConfig {
  return {
    repository: input.repository ? normalizeRepository(input.repository) : stored.repository,
    branch: input.branch?.trim() || stored.branch,
    basePath: input.basePath ? normalizeBasePath(input.basePath) : stored.basePath,
  };
}

function joinRepoPath(...parts: string[]): string {
  return path.posix.join(...parts.filter(Boolean));
}

function extensionFor(mimeType?: string, filename?: string): string {
  if (filename && /\.[a-z0-9]{2,5}$/i.test(filename)) return "";
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[mimeType || ""] || ".bin";
}
