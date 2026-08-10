import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";

type ManifestAsset = {
  sourceFileId: string;
  name: string;
  createdAt: string;
  project: string;
  confidence?: string;
  libraryPath?: string | null;
  mimeType: string;
  bundlePath: string;
  sha256: string;
  sizeBytes: number;
  targetPath: string;
  metadataPath: string;
  indexPath: string;
};

type MigrationManifest = {
  schemaVersion: number;
  migrationId: string;
  source: string;
  assetCount: number;
  totalBytes: number;
  defaultTarget?: {
    repository?: string;
    branch?: string;
    basePath?: string;
  };
  assets: ManifestAsset[];
};

type TreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
};

async function main() {
const args = parseArgs(process.argv.slice(2));
const bundlePath = args.positionals[0];
if (!bundlePath) {
  fail("Usage: npm run import:migration -- <bundle.zip> [--repo owner/repo] [--branch main] [--base-path projects] [--dry-run]");
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-asset-sync-"));
try {
  const root = prepareBundle(bundlePath, tempDir);
  const manifest = readManifest(root);

  const repository = args.repo ?? manifest.defaultTarget?.repository ?? process.env.ASSET_REPOSITORY;
  const branch = args.branch ?? manifest.defaultTarget?.branch ?? process.env.ASSET_BRANCH ?? "main";
  const basePath = normalizeBasePath(args.basePath ?? manifest.defaultTarget?.basePath ?? process.env.ASSET_BASE_PATH ?? "projects");

  if (!repository) fail("Target repository is required. Use --repo owner/repo or ASSET_REPOSITORY.");
  const normalizedRepo = normalizeRepository(repository);

  const validated = validateBundle(root, manifest, basePath);
  console.log(`Validated ${validated.length} assets (${formatBytes(manifest.totalBytes)}).`);

  if (args.dryRun) {
    printProjectSummary(validated);
    console.log("Dry run complete. No GitHub writes were made.");
    process.exit(0);
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) fail("GITHUB_TOKEN or GH_TOKEN is required for migration writes.");

  const github = new GitHubGitDatabase(token, normalizedRepo);
  const head = await github.getBranchHead(branch);
  const existing = await mapLimit(validated, 8, async (asset) => {
    const exists = await github.pathExists(asset.indexPath, branch);
    return { asset, exists };
  });

  const pending = existing.filter((x) => !x.exists).map((x) => x.asset);
  const skipped = existing.length - pending.length;
  console.log(`Pending: ${pending.length}; already indexed: ${skipped}.`);

  if (pending.length === 0) {
    console.log("Nothing to import.");
    process.exit(0);
  }

  const treeEntriesNested = await mapLimit(pending, 4, async (asset) => {
    const bytes = fs.readFileSync(asset.absolutePath);
    const assetBlob = await github.createBlob(bytes);

    const metadata = {
      schemaVersion: 1,
      source: manifest.source,
      migrationId: manifest.migrationId,
      sourceFileId: asset.sourceFileId,
      sourceSurface: "library",
      originalName: asset.name,
      project: asset.project,
      confidence: asset.confidence ?? null,
      libraryPath: asset.libraryPath ?? null,
      generatedAt: asset.createdAt,
      syncedAt: new Date().toISOString(),
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      assetPath: asset.targetPath,
      metadataPath: asset.metadataPath,
    };
    const metadataBlob = await github.createBlob(Buffer.from(JSON.stringify(metadata, null, 2) + "\n"));

    const index = {
      schemaVersion: 1,
      sha256: asset.sha256,
      sourceFileId: asset.sourceFileId,
      assetPath: asset.targetPath,
      metadataPath: asset.metadataPath,
      project: asset.project,
      migrationId: manifest.migrationId,
    };
    const indexBlob = await github.createBlob(Buffer.from(JSON.stringify(index, null, 2) + "\n"));

    return [
      { path: asset.targetPath, mode: "100644", type: "blob", sha: assetBlob } satisfies TreeEntry,
      { path: asset.metadataPath, mode: "100644", type: "blob", sha: metadataBlob } satisfies TreeEntry,
      { path: asset.indexPath, mode: "100644", type: "blob", sha: indexBlob } satisfies TreeEntry,
    ];
  });

  const treeEntries = treeEntriesNested.flat();
  const treeSha = await github.createTree(head.treeSha, treeEntries);
  const commitSha = await github.createCommit(
    `assets: import ${manifest.migrationId} (${pending.length} assets)`,
    treeSha,
    head.commitSha,
  );
  await github.updateBranch(branch, commitSha);

  console.log(`Imported ${pending.length} assets in one commit.`);
  console.log(`Commit: https://github.com/${normalizedRepo}/commit/${commitSha}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
}

function prepareBundle(bundlePath: string, tempDir: string): string {
  const resolved = path.resolve(bundlePath);
  if (!fs.existsSync(resolved)) fail(`Bundle not found: ${resolved}`);

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) return resolved;

  if (!resolved.toLowerCase().endsWith(".zip")) fail("Migration bundle must be a directory or .zip file.");
  const zip = new AdmZip(resolved);
  zip.extractAllTo(tempDir, true);
  return tempDir;
}

function readManifest(root: string): MigrationManifest {
  const file = path.join(root, "manifest.json");
  if (!fs.existsSync(file)) fail("manifest.json is missing from the migration bundle.");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as MigrationManifest;
  if (manifest.schemaVersion !== 1) fail(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}`);
  if (!Array.isArray(manifest.assets)) fail("manifest.assets must be an array.");
  if (manifest.assets.length !== manifest.assetCount) {
    fail(`Manifest assetCount mismatch: expected ${manifest.assetCount}, got ${manifest.assets.length}.`);
  }
  return manifest;
}

function validateBundle(root: string, manifest: MigrationManifest, basePath: string) {
  return manifest.assets.map((asset) => {
    const absolutePath = path.resolve(root, asset.bundlePath);
    const rootPrefix = path.resolve(root) + path.sep;
    if (!absolutePath.startsWith(rootPrefix)) fail(`Unsafe bundlePath: ${asset.bundlePath}`);
    if (!fs.existsSync(absolutePath)) fail(`Missing asset: ${asset.bundlePath}`);

    const bytes = fs.readFileSync(absolutePath);
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== asset.sha256) fail(`SHA256 mismatch for ${asset.bundlePath}`);
    if (bytes.length !== asset.sizeBytes) fail(`Size mismatch for ${asset.bundlePath}`);

    const suffix = stripLeadingProjects(asset.targetPath);
    const targetPath = path.posix.join(basePath, suffix);
    const metadataPath = `${targetPath}.json`;
    const indexPath = `.chatgpt-asset-sync/index/${asset.sha256}.json`;
    return { ...asset, absolutePath, targetPath, metadataPath, indexPath };
  });
}

function stripLeadingProjects(value: string): string {
  return value.replace(/^projects\//, "");
}

class GitHubGitDatabase {
  private readonly owner: string;
  private readonly repo: string;

  constructor(private readonly token: string, repository: string) {
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) fail(`Invalid repository: ${repository}`);
    this.owner = owner;
    this.repo = repo;
  }

  private async request<T>(endpoint: string, init: RequestInit = {}, allow404 = false): Promise<T | null> {
    const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${endpoint}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
    if (response.status === 204) return {} as T;
    return await response.json() as T;
  }

  async getBranchHead(branch: string): Promise<{ commitSha: string; treeSha: string }> {
    const ref = await this.request<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    if (!ref) throw new Error(`Branch not found: ${branch}`);
    const commit = await this.request<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    if (!commit) throw new Error("Unable to read branch commit.");
    return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
  }

  async pathExists(repoPath: string, branch: string): Promise<boolean> {
    const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
    const result = await this.request(`/contents/${encoded}?ref=${encodeURIComponent(branch)}`, {}, true);
    return result !== null;
  }

  async createBlob(content: Buffer): Promise<string> {
    const result = await this.request<{ sha: string }>("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
    });
    if (!result) throw new Error("Unable to create GitHub blob.");
    return result.sha;
  }

  async createTree(baseTree: string, entries: TreeEntry[]): Promise<string> {
    const result = await this.request<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: entries }),
    });
    if (!result) throw new Error("Unable to create GitHub tree.");
    return result.sha;
  }

  async createCommit(message: string, tree: string, parent: string): Promise<string> {
    const result = await this.request<{ sha: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree, parents: [parent] }),
    });
    if (!result) throw new Error("Unable to create GitHub commit.");
    return result.sha;
  }

  async updateBranch(branch: string, sha: string): Promise<void> {
    await this.request(`/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
    });
  }
}

function normalizeRepository(value: string): string {
  const input = value.trim().replace(/\/$/, "").replace(/\.git$/, "");
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) return input;
  const url = new URL(input);
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    fail("Only github.com repositories are supported.");
  }
  const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) fail("Invalid GitHub repository URL.");
  return `${parts[0]}/${parts[1]}`;
}

function normalizeBasePath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/") || "projects";
}

function parseArgs(argv: string[]) {
  const result: {
    positionals: string[];
    repo?: string;
    branch?: string;
    basePath?: string;
    dryRun: boolean;
  } = { positionals: [], dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--repo") result.repo = argv[++i];
    else if (arg === "--branch") result.branch = argv[++i];
    else if (arg === "--base-path") result.basePath = argv[++i];
    else if (arg?.startsWith("--")) fail(`Unknown option: ${arg}`);
    else if (arg) result.positionals.push(arg);
  }
  return result;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function printProjectSummary(assets: Array<{ project: string }>) {
  const counts = new Map<string, number>();
  for (const asset of assets) counts.set(asset.project, (counts.get(asset.project) ?? 0) + 1);
  console.log("Projects:");
  for (const [project, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${project}: ${count}`);
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
