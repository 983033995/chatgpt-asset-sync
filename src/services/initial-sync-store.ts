import fs from "node:fs/promises";
import path from "node:path";
import type { InitialSyncBundle, InitialSyncState } from "../types/migration.js";

interface StoredInitialSync {
  profiles: Record<string, InitialSyncState>;
}

const defaultProfile = "default";

function now() {
  return new Date().toISOString();
}

function emptyState(profileId: string): InitialSyncState {
  return {
    profileId,
    migrationId: null,
    phase: "idle",
    discoveredAssets: 0,
    processedAssets: 0,
    syncedAssets: 0,
    duplicateAssets: 0,
    failedAssets: 0,
    lastLibraryCreatedAt: null,
    bundle: null,
    commitSha: null,
    startedAt: null,
    updatedAt: now(),
    completedAt: null,
    error: null,
  };
}

export class InitialSyncStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<StoredInitialSync> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8")) as StoredInitialSync;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { profiles: {} };
      throw error;
    }
  }

  private async write(data: StoredInitialSync): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  async get(profileId = defaultProfile): Promise<InitialSyncState> {
    const data = await this.read();
    return data.profiles[profileId] ?? emptyState(profileId);
  }

  async begin(input: {
    profileId?: string;
    migrationId?: string;
    discoveredAssets?: number;
    lastLibraryCreatedAt?: string;
  }): Promise<InitialSyncState> {
    const profileId = input.profileId ?? defaultProfile;
    const data = await this.read();
    const stamp = now();
    const state: InitialSyncState = {
      ...emptyState(profileId),
      migrationId: input.migrationId ?? `library-${stamp.slice(0, 10)}`,
      phase: "awaiting-host-export",
      discoveredAssets: input.discoveredAssets ?? 0,
      lastLibraryCreatedAt: input.lastLibraryCreatedAt ?? null,
      startedAt: stamp,
      updatedAt: stamp,
    };
    data.profiles[profileId] = state;
    await this.write(data);
    return state;
  }

  async registerBundle(profileId = defaultProfile, bundle: InitialSyncBundle): Promise<InitialSyncState> {
    return this.patch(profileId, {
      phase: "bundle-ready",
      discoveredAssets: bundle.assetCount,
      bundle,
      error: null,
    });
  }

  async recordBatch(
    profileId = defaultProfile,
    delta: { processed: number; synced: number; duplicates: number; failed: number },
  ): Promise<InitialSyncState> {
    const current = await this.get(profileId);
    return this.patch(profileId, {
      phase: "importing",
      processedAssets: current.processedAssets + delta.processed,
      syncedAssets: current.syncedAssets + delta.synced,
      duplicateAssets: current.duplicateAssets + delta.duplicates,
      failedAssets: current.failedAssets + delta.failed,
      error: delta.failed > 0 ? `${delta.failed} asset(s) failed in the latest batch.` : current.error,
    });
  }

  async complete(input: {
    profileId?: string;
    assetCount: number;
    lastLibraryCreatedAt?: string;
    commitSha?: string;
  }): Promise<InitialSyncState> {
    const profileId = input.profileId ?? defaultProfile;
    const current = await this.get(profileId);
    const stamp = now();
    return this.patch(profileId, {
      phase: "completed",
      discoveredAssets: Math.max(current.discoveredAssets, input.assetCount),
      processedAssets: Math.max(current.processedAssets, input.assetCount),
      syncedAssets: Math.max(current.syncedAssets, input.assetCount - current.duplicateAssets),
      lastLibraryCreatedAt: input.lastLibraryCreatedAt ?? current.lastLibraryCreatedAt,
      commitSha: input.commitSha ?? current.commitSha,
      completedAt: stamp,
      error: null,
    });
  }

  async fail(profileId = defaultProfile, message: string): Promise<InitialSyncState> {
    return this.patch(profileId, { phase: "failed", error: message });
  }

  private async patch(profileId: string, patch: Partial<InitialSyncState>): Promise<InitialSyncState> {
    const data = await this.read();
    const current = data.profiles[profileId] ?? emptyState(profileId);
    const next: InitialSyncState = { ...current, ...patch, profileId, updatedAt: now() };
    data.profiles[profileId] = next;
    await this.write(data);
    return next;
  }
}
