# Initial Library Migration

ChatGPT Asset Sync v0.3 includes a one-shot migration runner for the first historical Library import.

## Bundle format

```text
migration.zip
├── manifest.json
├── checksums.sha256
├── README.md
└── assets/
    ├── file_xxx.png
    └── ...
```

`manifest.json` keeps the original ChatGPT `sourceFileId`, original filename, generated time, project, SHA256, size, target path, metadata path and index path.

## Validate first

```bash
npm install
npm run import:migration -- /path/to/migration.zip --dry-run
```

Dry-run verifies all files, sizes and SHA256 checksums and performs no GitHub writes.

## Import

```bash
export GITHUB_TOKEN=YOUR_GITHUB_TOKEN
npm run import:migration -- /path/to/migration.zip
```

The bundle may define a default target repository. You can override it at runtime:

```bash
npm run import:migration -- /path/to/migration.zip \
  --repo owner/repository \
  --branch main \
  --base-path projects
```

## Write strategy

The runner does not create one commit per image. It:

1. validates every local asset;
2. checks `.chatgpt-asset-sync/index/<sha256>.json` for idempotency;
3. creates Git blobs for pending asset + metadata + index files;
4. creates one tree based on the current branch tree;
5. creates one commit for the entire pending migration;
6. fast-forwards the configured branch.

This makes the migration retryable. If the same bundle is executed again, already indexed SHA256 assets are skipped.

## Output layout

```text
<asset-repository>/
├── projects/
│   └── <project>/
│       └── YYYY-MM-DD/
│           ├── original-name.png
│           └── original-name.png.json
└── .chatgpt-asset-sync/
    └── index/
        └── <sha256>.json
```

## Current user migration baseline

The 2026-08-10 initial bundle contains 88 `model_generated=true` ChatGPT Library images, excluding user-uploaded reference images. Its default target is `983033995/openmontage-assets` on `main` under `projects/`.
