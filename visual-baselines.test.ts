import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const approvedLinuxBaselines = {
  "desktop/complete-roster.png": ["144b6ec160fbec95f9a4917ae564739de2f0366d1badc9bd83ffa9bd3a24e924", [1280, 358]],
  "desktop/mode-selection.png": ["71f538540a12e9a27d1fa8fa834a44f5ea3105ea0dd104ba8f37a744c5bd863e", [1280, 149]],
  "desktop/player-picker.png": ["91a477e0117f4b422e5651562a86aa05ada09dab85e9b04aa59a9d90d1ffd6df", [1280, 447]],
  "desktop/results.png": ["50975cdae1a404e950f833f01cd5aa229b8cd85fe535d17b570e7bbc8bccb95c", [1280, 879]],
  "desktop/semifinal-highlights.png": ["6de8beb73ee2c2eaaa1d47eb87c9e2d76c725a9bc2c084d72c9876c287de7505", [1280, 1008]],
  "desktop/three-team-offer.png": ["a6fe87d8dcbcd4b85b1ca88c92fc2aca4478d516007defa90f6fb60038f5cf60", [1280, 531]],
  "pixel-7/complete-roster.png": ["7f6b6268b090ae81a8a427da5cf15dfd9c2e7b9034f3380b6435d6ea5235210c", [412, 425]],
  "pixel-7/mode-selection.png": ["deff618fa948e7a109aee253deb338689c67efdea987766c7c51c8401ab4e5cd", [412, 197]],
  "pixel-7/player-picker.png": ["a489983261cadc531851d90145554bd2916adb1674bba0df88ff619f487384a0", [412, 495]],
  "pixel-7/results.png": ["fc230dfaebbce494862c495ea6d08412a3c2b5518a6bfa63e2e329e125f1a520", [412, 927]],
  "pixel-7/semifinal-highlights.png": ["5960ae5ade76daf5d335a9cec1cb1fb96944c46e69b32b94a34b933e980b7ec8", [412, 1055]],
  "pixel-7/three-team-offer.png": ["a40684a95b1effa563b0cebc930d023fd9bc65ba0380d5663419b65c84f83f35", [412, 580]],
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

  it("accepts exactly the audited Linux candidate baselines", () => {
    const root = resolve(process.cwd(), "e2e/__screenshots__/linux");
    expect(Object.keys(approvedLinuxBaselines)).toHaveLength(12);
    const actualFiles = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(path => path.endsWith(".png")).map(path => path.replaceAll("\\", "/")).sort();
    expect(actualFiles).toEqual(Object.keys(approvedLinuxBaselines));
    for (const [relativePath, [sha256, [width, height]]] of Object.entries(approvedLinuxBaselines)) {
      const image = readFileSync(resolve(root, relativePath));
      expect(createHash("sha256").update(image).digest("hex"), relativePath).toBe(sha256);
      expect([image.readUInt32BE(16), image.readUInt32BE(20)], relativePath).toEqual([width, height]);
    }
  });
});
