export async function loadAssetBytes(input: {
  dataBase64?: string;
  sourceUrl?: string;
}): Promise<Buffer> {
  if (input.dataBase64) return Buffer.from(stripDataUrl(input.dataBase64), "base64");
  if (!input.sourceUrl) throw new Error("Provide dataBase64 or sourceUrl.");

  const url = new URL(input.sourceUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP(S) source URLs are supported.");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download asset: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function stripDataUrl(value: string): string {
  const index = value.indexOf(",");
  return value.startsWith("data:") && index >= 0 ? value.slice(index + 1) : value;
}
