export type InitialSyncPhase =
  | "idle"
  | "scanning"
  | "awaiting-host-export"
  | "bundle-ready"
  | "importing"
  | "completed"
  | "failed";

export interface InitialSyncBundle {
  filename: string;
  assetCount: number;
  totalBytes: number;
  sha256: string;
  createdAt: string;
}

export interface InitialSyncState {
  profileId: string;
  migrationId: string | null;
  phase: InitialSyncPhase;
  discoveredAssets: number;
  processedAssets: number;
  syncedAssets: number;
  duplicateAssets: number;
  failedAssets: number;
  lastLibraryCreatedAt: string | null;
  bundle: InitialSyncBundle | null;
  commitSha: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}
