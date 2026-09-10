import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { convertPortrait, loadPortraitCapture, loadRemotePortrait, MAX_PORTRAIT_BYTES } from "./portrait-media";

describe("portrait media", () => {
  it("makes a deterministic focused 256px WebP", async () => {
    const input = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#123456" } }).png().toBuffer();
    const first = await convertPortrait(input, { x: 0.5, y: 0.35 });
    const second = await convertPortrait(input, { x: 0.5, y: 0.35 });
    expect(first.equals(second)).toBe(true);
    await expect(sharp(first).metadata()).resolves.toMatchObject({ format: "webp", width: 256, height: 256 });
  });

  it("rejects SVGs over the 80 megapixel input limit", async () => {
    await expect(convertPortrait(Buffer.from('<svg width="10000" height="8001" xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toThrow(/80 megapixels/i);
  });

  it.each([5, 6, 7, 8])("uses oriented dimensions for focused EXIF orientation %i", async orientation => {
    const bytes = await sharp({ create: { width: 640, height: 480, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation }).toBuffer();
    const normalized = await sharp(bytes).rotate().png().toBuffer();
    const result = await convertPortrait(bytes, { x: 1, y: 0.5 });
    expect(result.equals(await convertPortrait(normalized, { x: 1, y: 0.5 }))).toBe(true);
  });

  it("accepts the injected fetch as its second argument", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("portrait"));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", fetch)).resolves.toEqual(Buffer.from("portrait"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["assets", "assets/portrait-sources", "assets/portrait-sources/nested"])("rejects a junction at %s", path => {
    const root = mkdtempSync(join(tmpdir(), "portrait-capture-"));
    const outside = mkdtempSync(join(tmpdir(), "portrait-outside-"));
    const parts = path.split("/");
    mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
    const suffix = ["assets", "portrait-sources", "nested"].slice(parts.length);
    mkdirSync(join(outside, ...suffix), { recursive: true });
    writeFileSync(join(outside, ...suffix, "player.png"), "OUTSIDE");
    symlinkSync(outside, join(root, ...parts), "junction");
    expect(() => loadPortraitCapture(root, "assets/portrait-sources/nested/player.png")).toThrow(/capture/i);
  });

  it("rejects an unapproved remote URL before fetching", async () => {
    const fetch = vi.fn();
    await expect(loadRemotePortrait("https://example.test/a.webp", fetch)).rejects.toThrow(/unapproved/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds remote redirects at four", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "/next.webp" } }));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", fetch)).rejects.toThrow(/redirect limit/i);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it.each([
    { status: 302, headers: new Headers({ location: "https://example.test/a.webp" }), error: /unapproved/i },
    { status: 404, headers: new Headers(), error: /404/ },
    { status: 200, headers: new Headers({ "content-length": String(MAX_PORTRAIT_BYTES + 1) }), error: /exceeds/i },
  ])("cancels discarded response bodies for status $status", async ({ status, headers, error }) => {
    const cancel = vi.fn(() => Promise.reject(new Error("cleanup failed")));
    const response = new Response(new ReadableStream({ cancel }), { status, headers });
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", vi.fn().mockResolvedValue(response))).rejects.toThrow(error);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["rejects", "stalls"])("preserves streamed byte limit errors when cancellation %s", async behavior => {
    const cancel = vi.fn(() => behavior === "rejects" ? Promise.reject(new Error("cleanup failed")) : new Promise<void>(() => {}));
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_PORTRAIT_BYTES + 1)); },
      cancel,
    }));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", vi.fn().mockResolvedValue(response))).rejects.toThrow(/exceeds/i);
    expect(cancel).toHaveBeenCalledTimes(1);
  }, 500);

  it("rejects declared and streamed downloads over 15 MiB", async () => {
    const declared = vi.fn().mockResolvedValue(new Response(null, { headers: { "content-length": String(MAX_PORTRAIT_BYTES + 1) } }));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", declared)).rejects.toThrow(/exceeds/i);
    const streamed = vi.fn().mockResolvedValue(new Response(new Uint8Array(MAX_PORTRAIT_BYTES + 1)));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", streamed)).rejects.toThrow(/exceeds/i);
  });

  it("times out a stalled request and body", async () => {
    const request = vi.fn(() => new Promise<Response>(() => {}));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", request, { timeoutMs: 5 })).rejects.toThrow(/timed out/i);
    const body = vi.fn().mockResolvedValue(new Response(new ReadableStream()));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", body, { timeoutMs: 5 })).rejects.toThrow(/timed out/i);
  });

  it("reads capture files and rejects directories and oversized captures", () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-capture-"));
    const directory = join(root, "assets", "portrait-sources");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "player.png"), "portrait");
    expect(loadPortraitCapture(root, "assets/portrait-sources/player.png")).toEqual(Buffer.from("portrait"));
    mkdirSync(join(directory, "folder"));
    expect(() => loadPortraitCapture(root, "assets/portrait-sources/folder")).toThrow(/capture/i);
    writeFileSync(join(directory, "large.png"), Buffer.alloc(MAX_PORTRAIT_BYTES + 1));
    expect(() => loadPortraitCapture(root, "assets/portrait-sources/large.png")).toThrow(/exceeds/i);
  });

  it("rejects a redirect from an approved host to an unapproved host", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.test/a.webp" } }));
    await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.webp", fetch)).rejects.toThrow(/unapproved/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects capture traversal and symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-capture-"));
    const sourceDir = join(root, "assets", "portrait-sources");
    mkdirSync(sourceDir, { recursive: true });
    const target = join(root, "outside.png");
    writeFileSync(target, "outside");
    expect(() => loadPortraitCapture(root, "assets/portrait-sources/../outside.png")).toThrow(/capture/i);
    try {
      symlinkSync(target, join(sourceDir, "player-1.png"));
      expect(() => loadPortraitCapture(root, "assets/portrait-sources/player-1.png")).toThrow(/capture/i);
    } catch (error) {
      if (!(error instanceof Error) || !/EPERM/.test(error.message)) throw error;
    }
  });
});
