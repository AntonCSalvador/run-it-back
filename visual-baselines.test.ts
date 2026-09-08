import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const approvedWindowsBlobs = {
  "desktop/complete-roster.png": "f188bcf19b68fe08105e583b517c8b42eff8fba9",
  "desktop/mode-selection.png": "3e16da1a0be7504aec1767bcc01e52b44872a834",
  "desktop/player-picker.png": "ed92995bc37d5aa3c6d3148bdf8be7dddf216f20",
  "desktop/results-champion.png": "259ff3e04226b178137a596cc6fde2e6509409cd",
  "desktop/results-eliminated.png": "405fc434fd481b1be9c3bfa0e394cb05dad0ec32",
  "desktop/semifinal-highlights.png": "9ebe99eb53258f380cc260f376d3f7d041d37baf",
  "desktop/three-team-offer.png": "afb8d5a3d70fdc9ec4e476a3b0117bbc26f5194c",
  "pixel-7/complete-roster.png": "53c7b16ebcb6717fa130916e1443832099ac4e88",
  "pixel-7/mode-selection.png": "0bdf3a0fca075e036fbeb84e2d191fd48d971079",
  "pixel-7/player-picker.png": "d7c91b5df9f867ae3108f425c683c76f1f548398",
  "pixel-7/results-champion.png": "60feffa987239ff2925105e34080f689635e76fd",
  "pixel-7/results-eliminated.png": "c7df421bc3601f5aa3bdcdeb0b20b8fdfa8a6048",
  "pixel-7/semifinal-highlights.png": "a90e07607db53f4d5d174e283971a99f89a23d89",
  "pixel-7/three-team-offer.png": "d5b63ff8fba45695212fba4798a5cf28bd0e7163",
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
