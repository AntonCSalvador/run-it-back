import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { validateAssetPath } from "./asset-validation";

const root = mkdtempSync(join(tmpdir(), "asset-validation-"));
mkdirSync(join(root, "public", "assets"), { recursive: true });
writeFileSync(join(root, "public", "assets", "ok.svg"), "ok");
writeFileSync(join(root, "public", "assets", "..logo.svg"), "ok");
afterAll(() => {
  const tempRelative = relative(tmpdir(), root);
  if (tempRelative.startsWith("..") || isAbsolute(tempRelative)) throw new Error("refusing to remove fixture outside temp directory");
  rmSync(root, { recursive: true, force: true });
});
describe("validateAssetPath", () => {
  it("accepts regular files under public/assets", () => expect(validateAssetPath("/assets/ok.svg", root)).toBeNull());
  it("accepts filenames beginning with two dots", () => expect(validateAssetPath("/assets/..logo.svg", root)).toBeNull());
  it("rejects missing, directories, and traversal", () => {
    expect(validateAssetPath("/assets/nope.svg", root)).toMatch(/missing/);
    expect(validateAssetPath("/assets", root)).toMatch(/invalid/);
    expect(validateAssetPath("/assets/../secret.svg", root)).toMatch(/invalid/);
  });
  it("rejects symlinked asset targets", () => {
    const outside = join(root, "outside.svg"); writeFileSync(outside, "outside");
    try { symlinkSync(outside, join(root, "public", "assets", "link.svg")); }
    catch (error) { if (error && typeof error === "object" && "code" in error && ["EPERM", "EACCES", "ENOTSUP"].includes(String(error.code))) return; throw error; }
    expect(validateAssetPath("/assets/link.svg", root)).toMatch(/symlink|regular file|outside/);
  });
  it("rejects an assets root symlink escaping public", () => {
    const escapedRoot = mkdtempSync(join(tmpdir(), "asset-validation-escaped-"));
    try {
      const outside = join(escapedRoot, "outside-assets"); mkdirSync(outside); writeFileSync(join(outside, "escape.svg"), "escape");
      const publicDir = join(escapedRoot, "public"); mkdirSync(publicDir);
      try { symlinkSync(outside, join(publicDir, "assets"), "junction"); }
      catch (error) { if (error && typeof error === "object" && "code" in error && ["EPERM", "EACCES", "ENOTSUP"].includes(String(error.code))) return; throw error; }
      expect(validateAssetPath("/assets/escape.svg", escapedRoot)).toMatch(/symlink|outside/);
    } finally { rmSync(escapedRoot, { recursive: true, force: true }); }
  });
  it("rejects a public root symlink escaping the project", () => {
    const escapedRoot = mkdtempSync(join(tmpdir(), "asset-validation-public-"));
    try {
      const outside = join(escapedRoot, "outside-public"); mkdirSync(join(outside, "assets"), { recursive: true }); writeFileSync(join(outside, "assets", "escape.svg"), "escape");
      try { symlinkSync(outside, join(escapedRoot, "public"), "junction"); }
      catch (error) { if (error && typeof error === "object" && "code" in error && ["EPERM", "EACCES", "ENOTSUP"].includes(String(error.code))) return; throw error; }
      expect(validateAssetPath("/assets/escape.svg", escapedRoot)).toMatch(/public.*symlink|outside/);
    } finally { rmSync(escapedRoot, { recursive: true, force: true }); }
  });
});
