import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { validateAssetPath } from "./asset-validation";

const root = mkdtempSync(join(tmpdir(), "asset-validation-"));
mkdirSync(join(root, "public", "assets"), { recursive: true });
writeFileSync(join(root, "public", "assets", "ok.svg"), "ok");
describe("validateAssetPath", () => {
  it("accepts regular files under public/assets", () => expect(validateAssetPath("/assets/ok.svg", root)).toBeNull());
  it("rejects missing, directories, and traversal", () => {
    expect(validateAssetPath("/assets/nope.svg", root)).toMatch(/missing/);
    expect(validateAssetPath("/assets", root)).toMatch(/invalid/);
    expect(validateAssetPath("/assets/../secret.svg", root)).toMatch(/invalid/);
  });
  it("rejects symlinks resolving outside assets", () => {
    const outside = join(root, "outside.svg"); writeFileSync(outside, "outside");
    try { symlinkSync(outside, join(root, "public", "assets", "link.svg")); } catch { return; }
    expect(validateAssetPath("/assets/link.svg", root)).toMatch(/outside/);
  });
});
