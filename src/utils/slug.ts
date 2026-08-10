export function slugify(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%{}^~\[\]`]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "unclassified";
}

export function safeFilename(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
  return cleaned || "asset.png";
}
