import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { convertPortrait, loadCapturePortrait, loadRemotePortrait } from "./portrait-media";

describe("portrait media", () => {
  it("makes a deterministic focused 256px WebP", async () => {
    const input = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#123456" } }).png().toBuffer();
    const first = await convertPortrait(input, { x: 0.5, y: 0.35 });
    const second = await convertPortrait(input, { x: 0.5, y: 0.35 });
    expect(first.equals(second)).toBe(true);
    await expect(sharp(first).metadata()).resolves.toMatchObject({ format: "webp", width: 256, height: 256 });
  });

  it("rejects SVGs over the 80 megapixel input limit", async () => {
    await expect(convertPortrait(Buffer.from('<svg width="10000" height="8001" xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toThrow(/pixel/i);
  });

  it("rejects an unapproved remote URL before fetching", async () => {
    const fetch = vi.fn();
    await expect(loadRemotePortrait("https://example.test/a.webp", { fetch })).rejects.toThrow(/unapproved/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a redirect from an approved host to an unapproved host", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.test/a.webp" } }));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", { fetch })).rejects.toThrow(/unapproved/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects capture traversal and symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-capture-"));
    const sourceDir = join(root, "assets", "portrait-sources");
    mkdirSync(sourceDir, { recursive: true });
    const target = join(root, "outside.png");
    writeFileSync(target, "outside");
    expect(() => loadCapturePortrait(root, "assets/portrait-sources/../outside.png")).toThrow(/capture/i);
    try {
      symlinkSync(target, join(sourceDir, "player-1.png"));
      expect(() => loadCapturePortrait(root, "assets/portrait-sources/player-1.png")).toThrow(/capture/i);
    } catch (error) {
      if (!(error instanceof Error) || !/EPERM/.test(error.message)) throw error;
    }
  });
});
