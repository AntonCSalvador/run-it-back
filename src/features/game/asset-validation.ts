import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const contained = (base: string, target: string) => {
  const child = relative(base, target);
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
};

export function validateAssetPath(asset: string | null, projectRoot: string): string | null {
  if (asset === null) return null;
  if (!asset.startsWith("/assets/") || asset.includes("\\") || asset.split("/").includes("..")) return `invalid asset path "${asset}"`;
  const publicRoot = resolve(projectRoot, "public");
  const assetsRoot = resolve(publicRoot, "assets");
  if (!existsSync(publicRoot)) return "public directory is missing";
  if (lstatSync(publicRoot).isSymbolicLink()) return "public directory must not be a symlink";
  const realProjectRoot = realpathSync(resolve(projectRoot));
  const realPublicRoot = realpathSync(publicRoot);
  const expectedPublicRoot = resolve(realProjectRoot, "public");
  if (realPublicRoot !== expectedPublicRoot) return "public directory resolves outside project root";
  if (!existsSync(assetsRoot)) return `public/assets is missing for "${asset}"`;
  if (lstatSync(assetsRoot).isSymbolicLink()) return "public/assets must not be a symlink";
  const realAssetsRoot = realpathSync(assetsRoot);
  if (!contained(realPublicRoot, realAssetsRoot)) return "public/assets resolves outside public";
  const target = resolve(publicRoot, `.${asset}`);
  if (!contained(assetsRoot, target)) return `asset outside public/assets "${asset}"`;
  if (!existsSync(target)) return `missing local asset "${asset}"`;
  if (lstatSync(target).isSymbolicLink()) return `symlinked asset is not allowed "${asset}"`;
  if (!lstatSync(target).isFile()) return `non-file asset "${asset}"`;
  if (!contained(realAssetsRoot, realpathSync(target))) return `asset resolves outside public/assets "${asset}"`;
  return null;
}
