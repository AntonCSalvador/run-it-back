import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest loads the executable .mts module through Vite.
import { validatePortraitFiles } from "./validate-data.mts";

describe("portrait file validation", () => {
  it.each([
    ["wrong format", { format: "png", width: 256, height: 256 }],
    ["wrong dimensions", { format: "webp", width: 128, height: 256 }],
  ])("rejects %s", async (_label, image) => {
    const root = mkdtempSync(join(tmpdir(), "portrait-validation-"));
    try {
      const directory = join(root, "public", "assets", "players");
      mkdirSync(directory, { recursive: true });
      const bytes = await sharp({ create: { width: image.width, height: image.height, channels: 3, background: "white" } })[image.format as "png" | "webp"]().toBuffer();
      const filename = "player-1.123456abcdef.webp";
      writeFileSync(join(directory, filename), bytes);
      const rows = [{ playerId: "player-1", portrait: `/assets/players/${filename}`, sha256: createHash("sha256").update(bytes).digest("hex") }];
      expect(await validatePortraitFiles(root, rows, 1)).toContain("portrait player-1 must be a 256x256 WebP");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("rejects checksum mismatches and orphan public portraits", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-validation-"));
    try {
      const directory = join(root, "public", "assets", "players");
      mkdirSync(directory, { recursive: true });
      const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: "white" } }).webp().toBuffer();
      writeFileSync(join(directory, "player-1.123456abcdef.webp"), bytes);
      writeFileSync(join(directory, "player-2.abcdef123456.webp"), bytes);
      const errors = await validatePortraitFiles(root, [{ playerId: "player-1", portrait: "/assets/players/player-1.123456abcdef.webp", sha256: "0".repeat(64) }], 1);
      expect(errors).toContain("portrait player-1 checksum mismatch");
      expect(errors).toContain("orphan public portrait player-2.abcdef123456.webp");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
