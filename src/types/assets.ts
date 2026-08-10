export interface AssetRepositoryConfig {
  repository: string;
  branch: string;
  basePath: string;
}

export interface AssetSyncInput {
  profileId?: string;
  repository?: string;
  branch?: string;
  basePath?: string;
  project?: string;
  conversationId?: string;
  conversationTitle?: string;
  chatgptProject?: string;
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
}
