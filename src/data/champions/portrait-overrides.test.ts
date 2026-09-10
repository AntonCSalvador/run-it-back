import { describe, expect, it } from "vitest";
import { parsePortraitOverrides } from "./portrait-overrides";

const players = [{ id: "player-817", canonicalHandle: "FiNESSE" }] as const;

const officialStill = {
  playerId: "player-817",
  sourceKind: "riot-portrait",
  sourcePageUrl: "https://valorantesports.com/news/finesse",
  mediaUrl: "https://cmsassets.rgpub.io/images/finesse.png",
  credit: "Valorant Esports / Riot Games",
  copyrightOwner: "Riot Games",
  reuseBasis: "riot-fan-policy",
  license: "Riot Legal",
  identityConfirmed: true,
  cropFocus: { x: 0.5, y: 0.35 },
} as const;

describe("portrait overrides", () => {
  it.each([
    { originalUrl: undefined },
    { originalUrl: "https://example.test/portrait" },
    { license: "Riot Legal" },
    { copyrightOwner: "Photographer" },
    { credit: "Photographer" },
  ])("rejects inconsistent reviewed Liquipedia Riot permission %j", change => {
    const row = { ...officialStill, sourceKind: "liquipedia", sourcePageUrl: "https://liquipedia.net/commons/File:FiNESSE.jpg", mediaUrl: "https://liquipedia.net/commons/images/finesse.jpg", originalUrl: "https://www.flickr.com/photos/valorantesports/123/", credit: "VCT Photo Team / Riot Games", license: "permission", ...change };
    expect(() => parsePortraitOverrides([row], players)).toThrow();
  });
  it("rejects an original URL override on official stills", () => {
    expect(() => parsePortraitOverrides([{ ...officialStill, originalUrl: "https://example.test/portrait" }], players)).toThrow();
  });
  it("allows omitted crop focus and validated reviewed event/date metadata", () => {
    const { cropFocus, ...base } = officialStill;
    void cropFocus;
    const row = { ...base, event: "Champions", sourcePublishedAt: "2025-09-01" };
    expect(parsePortraitOverrides([row], players)).toEqual([row]);
    expect(() => parsePortraitOverrides([{ ...row, event: " " }], players)).toThrow();
    expect(() => parsePortraitOverrides([{ ...row, sourcePublishedAt: "2025-02-30" }], players)).toThrow();
  });
  it("parses a reviewed official still without changing it", () => {
    expect(parsePortraitOverrides([officialStill], players)).toEqual([officialStill]);
  });

  it("parses an approved broadcast frame capture", () => {
    const frame = {
      ...officialStill,
      sourceKind: "vct-broadcast-frame",
      sourcePageUrl: "https://valorantesports.com/video/finesse",
      videoUrl: "https://www.youtube.com/watch?v=official-video",
      videoTimestampSeconds: 123.5,
      capturePath: "assets/portrait-sources/player-817.png",
    };
    const { mediaUrl: _mediaUrl, ...frameWithoutMedia } = frame;

    expect(parsePortraitOverrides([frameWithoutMedia], players)).toEqual([frameWithoutMedia]);
  });

  it("parses a Liquipedia Commons still under its open license", () => {
    const liquipediaStill = {
      ...officialStill,
      sourceKind: "liquipedia",
      sourcePageUrl: "https://liquipedia.net/commons/File:FiNESSE.jpg",
      mediaUrl: "https://liquipedia.net/commons/images/a/a/FiNESSE.jpg",
      credit: "Example Photographer",
      copyrightOwner: "Example Photographer",
      reuseBasis: "open-license",
      license: "cc-by-sa-4.0",
    };

    expect(parsePortraitOverrides([liquipediaStill], players)).toEqual([liquipediaStill]);
  });

  it.each([
    ["unknown player", { ...officialStill, playerId: "player-999" }, /unknown player/],
    ["duplicate player", [officialStill, officialStill], /duplicate player/],
    ["identity confirmation", { ...officialStill, identityConfirmed: false }, /identity confirmation/],
    ["HTTP source", { ...officialStill, sourcePageUrl: "http://valorantesports.com/news/finesse" }, /HTTPS/],
    ["Riot ownership", { ...officialStill, copyrightOwner: "Example Photographer" }, /Riot ownership/],
    ["capture path", { ...officialStill, sourceKind: "vct-broadcast-frame", capturePath: "../escape.png", videoUrl: "https://www.youtube.com/watch?v=official-video", videoTimestampSeconds: 123.5 }, /capture path/],
    ["empty Liquipedia description filename", { ...officialStill, sourceKind: "liquipedia", sourcePageUrl: "https://liquipedia.net/commons/File:", mediaUrl: "https://liquipedia.net/commons/images/a/a/FiNESSE.jpg", copyrightOwner: "Example Photographer", reuseBasis: "open-license", license: "cc-by-sa-4.0" }, /description page/],
    ["empty Liquipedia media filename", { ...officialStill, sourceKind: "liquipedia", sourcePageUrl: "https://liquipedia.net/commons/File:FiNESSE.jpg", mediaUrl: "https://liquipedia.net/commons/images/", copyrightOwner: "Example Photographer", reuseBasis: "open-license", license: "cc-by-sa-4.0" }, /media URL/],
  ])("rejects %s", (_label, override, message) => {
    const rows = Array.isArray(override) ? override : [override];
    expect(() => parsePortraitOverrides(rows, players)).toThrow(message);
  });
});
