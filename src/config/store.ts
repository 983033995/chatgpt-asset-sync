import fs from "node:fs/promises";
import path from "node:path";
import type { AssetRepositoryConfig } from "../types/assets.js";
import { normalizeBasePath, normalizeRepository } from "../utils/repository.js";

interface StoredConfig {
  profiles: Record<string, AssetRepositoryConfig>;
}

const defaultProfile = "default";

export class ConfigStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<StoredConfig> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8")) as StoredConfig;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { profiles: {} };
      throw error;
    }
  }

  private async write(data: StoredConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  async get(profileId = defaultProfile): Promise<AssetRepositoryConfig> {
    const data = await this.read();
    const stored = data.profiles[profileId];
    if (stored) return stored;

    const repository = process.env.ASSET_REPOSITORY;
    if (!repository) {
      throw new Error("No asset repository configured. Call set_asset_repository first.");
    }

    return {
      repository: normalizeRepository(repository),
      branch: process.env.ASSET_BRANCH || "main",
      basePath: normalizeBasePath(process.env.ASSET_BASE_PATH),
    };
  }

  async set(profileId = defaultProfile, config: AssetRepositoryConfig): Promise<AssetRepositoryConfig> {
    const data = await this.read();
    const normalized: AssetRepositoryConfig = {
      repository: normalizeRepository(config.repository),
      branch: config.branch.trim() || "main",
      basePath: normalizeBasePath(config.basePath),
    };
    data.profiles[profileId] = normalized;
    await this.write(data);
    return normalized;
  }
}
