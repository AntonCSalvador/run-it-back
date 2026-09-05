/** Turns a validated, public asset path into a deployment-safe URL. */
export function assetUrl(path: string | null): string | null {
  if (path === null || path.includes("\\") || path.split("/").includes("..")) return null;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (base && path.startsWith(`${base}/assets/`)) return path;
  if (!path.startsWith("/assets/")) return null;
  return `${base.replace(/\/$/, "")}${path}`;
}
