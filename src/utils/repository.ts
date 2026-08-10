export function normalizeRepository(value: string): string {
  const input = value.trim().replace(/\/$/, "");
  if (!input) throw new Error("Asset repository is required.");

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) {
    return input.replace(/\.git$/, "");
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Repository must be owner/repo or a GitHub repository URL.");
  }

  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    throw new Error("Only github.com repository URLs are supported in v0.1.");
  }

  const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Invalid GitHub repository URL.");
  return `${parts[0]}/${parts[1]}`;
}

export function normalizeBasePath(value: string | undefined): string {
  const normalized = (value ?? "projects")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
  return normalized || "projects";
}
