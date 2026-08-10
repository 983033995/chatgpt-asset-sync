export interface AssetRepositoryConfig {
  repository: string;
  branch: string;
  basePath: string;
  [key: string]: unknown;
}

export type AssetSourceSurface = "library" | "conversation" | "api" | "upload";

export interface AssetSyncInput {
  profileId?: string;
  repository?: string;
  branch?: string;
  basePath?: string;
  project?: string;
  conversationId?: string;
  conversationTitle?: string;
  chatgptProject?: string;
  sourceFileId?: string;
  sourceSurface?: AssetSourceSurface;
  filename?: string;
  mimeType?: string;
  sourceUrl?: string;
  dataBase64?: string;
  prompt?: string;
  generatedAt?: string;
}

export interface AssetSyncResult {
  synced: boolean;
  duplicate: boolean;
  repository: string;
  branch: string;
  project: string;
  assetPath: string;
  metadataPath: string;
  sha256: string;
  reason?: string;
  [key: string]: unknown;
}

export interface LibraryImportBatchResult {
  migrationId: string;
  processed: number;
  synced: number;
  duplicates: number;
  failed: number;
  results: Array<
    | { sourceFileId?: string; ok: true; result: AssetSyncResult }
    | { sourceFileId?: string; ok: false; error: string }
  >;
  [key: string]: unknown;
}
