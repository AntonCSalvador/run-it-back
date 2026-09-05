/** Turns a validated, public asset path into a deployment-safe URL. */
export function assetUrl(path: string | null): string | null {
  const base = localBase(process.env.NEXT_PUBLIC_BASE_PATH ?? "");
  if (base === null || path === null) return null;
  const local = base && path.startsWith(`${base}/`) ? path.slice(base.length) : path;
  if (!localAsset(local)) return null;
  return `${base}${local}`;
}

function localBase(base: string): string | null {
  if (base === "") return "";
  const normalized = base.replace(/\/$/, "");
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(normalized)) return null;
  return normalized;
}
function localAsset(path: string): boolean {
  if (!path.startsWith("/assets/") || /[\\\u0000-\u001f?#]/.test(path) || /%2f|%5c/i.test(path)) return false;
  let decoded = path;
  for (let round = 0; round < 2; round += 1) { try { decoded = decodeURIComponent(decoded); } catch { return false; } }
  return decoded.startsWith("/assets/") && !decoded.includes("\\") && !decoded.split("/").some(part => part === "." || part === "..");
}
