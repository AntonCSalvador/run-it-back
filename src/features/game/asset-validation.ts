import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function validateAssetPath(asset: string | null, projectRoot: string): string | null {
  if (asset === null) return null;
  if (!asset.startsWith("/assets/") || asset.includes("\\") || asset.split("/").includes("..")) return `invalid asset path "${asset}"`;
  const publicRoot = resolve(projectRoot, "public");
  const assetsRoot = resolve(publicRoot, "assets");
  if (!existsSync(assetsRoot)) return `public/assets is missing for "${asset}"`;
  const target = resolve(publicRoot, `.${asset}`);
  const lexicalRelative = relative(assetsRoot, target);
  if (lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) return `asset outside public/assets "${asset}"`;
  if (!existsSync(target)) return `missing local asset "${asset}"`;
  if (!lstatSync(target).isFile()) return `non-file asset "${asset}"`;
  const realRelative = relative(realpathSync(assetsRoot), realpathSync(target));
  if (realRelative.startsWith("..") || isAbsolute(realRelative)) return `asset resolves outside public/assets "${asset}"`;
  return null;
}
