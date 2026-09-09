import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const approvedWindowsBlobs = {
  "desktop/complete-roster.png": "83d0f143528424707357d46bc9155aa77495de4c",
  "desktop/mode-selection.png": "9afd5415c9029b8585298644a8614c0f3ec38039",
  "desktop/player-picker.png": "24cdbc458b3e9fd52ac18438d715156b06c6e2dd",
  "desktop/results-champion.png": "0abde5dfdfca6b4b84465788e8207ae58ac360b0",
  "desktop/results-eliminated.png": "3c4b04b6a63e552c4abce7f4df7e8efc781a62a9",
  "desktop/semifinal-highlights.png": "be2445abac612de65a7cbf24dafe0fab784299f0",
  "desktop/three-team-offer.png": "5bf016c5b167b5973c80fca2f7c327819b27f1a1",
  "pixel-7/complete-roster.png": "c239f016f8b8794e801a2a3a4b190dbf3a6b2495",
  "pixel-7/mode-selection.png": "4b5da2be498bf285fa286d3b67cc27a69026fe95",
  "pixel-7/player-picker.png": "6066681b08e9f1c71b2d2f7d56dc7199c32eb735",
  "pixel-7/results-champion.png": "8f9830a29c8e4cac08bb92ce8a99e917dcd98ce2",
  "pixel-7/results-eliminated.png": "a514a515c4e5b987b0260012e6358285e2795792",
  "pixel-7/semifinal-highlights.png": "7728b0a59235012378d9162ca19233eaf0f0c11d",
  "pixel-7/three-team-offer.png": "5f8c6fe27a28626233de55ba95f38f6e8faed828",
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

function gitBlobSha1(content: Uint8Array): string {
  return createHash("sha1")
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest("hex");
}

describe("platform visual baselines", () => {
  it("computes Git blob object IDs in-process", () => {
    expect(gitBlobSha1(Buffer.alloc(0))).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  it("stores snapshots by platform and keeps all captures strictly compared", () => {
    const config = readFileSync(resolve(process.cwd(), "playwright.config.ts"), "utf8");
    const journey = readFileSync(resolve(process.cwd(), "e2e/free-play.spec.ts"), "utf8");
    expect(config).toContain("{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}");
    expect(journey).toContain("maxDiffPixelRatio: 0.01");
    expect(journey).not.toContain("screenshot-tolerance");
    expect(existsSync(resolve(process.cwd(), "e2e/support/screenshot-tolerance.ts"))).toBe(false);
  });

  it("preserves every approved Windows baseline byte-for-byte", () => {
    expect(Object.keys(approvedWindowsBlobs)).toHaveLength(14);
    for (const [relativePath, approvedBlob] of Object.entries(approvedWindowsBlobs)) {
      const path = resolve(process.cwd(), "e2e/__screenshots__/win32", relativePath);
      expect(existsSync(path), relativePath).toBe(true);
      expect(gitBlobSha1(readFileSync(path)), relativePath).toBe(approvedBlob);
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
