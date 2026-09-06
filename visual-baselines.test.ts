import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const approvedWindowsBlobs = {
  "desktop/complete-roster.png": "eadc15495e5c3f9a461268fcefa37d12c20c47c0",
  "desktop/mode-selection.png": "0e31848491e30b87f7bbae01520018c65e4b6a73",
  "desktop/player-picker.png": "ce0b9c75df03983298470391a5975ea68bff5e8d",
  "desktop/results.png": "2a372c1df9cc2e466da998b63646f5e54b5e99fe",
  "desktop/semifinal-highlights.png": "43de172d1a6c687ff7fb1f8404c632f1d8cd9dbe",
  "desktop/three-team-offer.png": "13ddda1b54a988be5b58daff79a2b728e0d5efcd",
  "pixel-7/complete-roster.png": "51d5c266767ca5a9d93c0f0ae08f433914b14dbe",
  "pixel-7/mode-selection.png": "951638a6ee990b72489b6ae73ac3282ddd5a1922",
  "pixel-7/player-picker.png": "1698008f91ae3c980fa75476ae44d4c8fa27bc5d",
  "pixel-7/results.png": "3ac078c75b3f445e55f991ac5a420753016a4259",
  "pixel-7/semifinal-highlights.png": "0bcc8344cfe6182b9eb0853b3abf99d1c2fd91a7",
  "pixel-7/three-team-offer.png": "4468842667b21cb718c5e579d66b8ca8402a548c",
} as const;

describe("platform visual baselines", () => {
  it("stores snapshots by platform and keeps all captures strictly compared", () => {
    const config = readFileSync(resolve(process.cwd(), "playwright.config.ts"), "utf8");
    const journey = readFileSync(resolve(process.cwd(), "e2e/free-play.spec.ts"), "utf8");
    expect(config).toContain("{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}");
    expect(journey).toContain("maxDiffPixelRatio: 0.01");
    expect(journey).not.toContain("screenshot-tolerance");
    expect(existsSync(resolve(process.cwd(), "e2e/support/screenshot-tolerance.ts"))).toBe(false);
  });

  it("preserves every approved Windows baseline byte-for-byte", () => {
    expect(Object.keys(approvedWindowsBlobs)).toHaveLength(12);
    for (const [relativePath, approvedBlob] of Object.entries(approvedWindowsBlobs)) {
      const path = resolve(process.cwd(), "e2e/__screenshots__/win32", relativePath);
      expect(existsSync(path), relativePath).toBe(true);
      expect(execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim(), relativePath).toBe(approvedBlob);
    }
  });
});
