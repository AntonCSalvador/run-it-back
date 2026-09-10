import { describe, expect, it } from "vitest";
import { parsePortraitOverrides } from "./portrait-overrides";

const players = [{ id: "player-817", canonicalHandle: "FiNESSE" }] as const;

const officialStill = {
  playerId: "player-817",
  sourceKind: "riot-portrait",
  sourcePage: "https://valorantesports.com/news/finesse",
  mediaUrl: "https://cmsassets.rgpub.io/images/finesse.png",
  credit: "Valorant Esports / Riot Games",
  copyrightOwner: "Riot Games",
  reuseBasis: "riot-fan-policy",
  license: "Riot Legal",
  identityConfirmed: true,
  cropFocus: { x: 0.5, y: 0.35 },
} as const;

describe("portrait overrides", () => {
  it("parses a reviewed official still without changing it", () => {
    expect(parsePortraitOverrides([officialStill], players)).toEqual([officialStill]);
  });

  it("parses an approved broadcast frame capture", () => {
    const frame = {
      ...officialStill,
      sourceKind: "vct-broadcast-frame",
      sourcePage: "https://valorantesports.com/video/finesse",
      videoUrl: "https://www.youtube.com/watch?v=official-video",
      videoTimestampSeconds: 123.5,
      capturePath: "assets/portrait-sources/player-817.png",
    };
    const { mediaUrl: _mediaUrl, ...frameWithoutMedia } = frame;

    expect(parsePortraitOverrides([frameWithoutMedia], players)).toEqual([frameWithoutMedia]);
  });

  it.each([
    ["unknown player", { ...officialStill, playerId: "player-999" }, /unknown player/],
    ["duplicate player", [officialStill, officialStill], /duplicate player/],
    ["identity confirmation", { ...officialStill, identityConfirmed: false }, /identity confirmation/],
    ["HTTP source", { ...officialStill, sourcePage: "http://valorantesports.com/news/finesse" }, /HTTPS/],
    ["Riot ownership", { ...officialStill, copyrightOwner: "Example Photographer" }, /Riot ownership/],
    ["capture path", { ...officialStill, sourceKind: "vct-broadcast-frame", capturePath: "../escape.png", videoUrl: "https://www.youtube.com/watch?v=official-video", videoTimestampSeconds: 123.5 }, /capture path/],
  ])("rejects %s", (_label, override, message) => {
    const rows = Array.isArray(override) ? override : [override];
    expect(() => parsePortraitOverrides(rows, players)).toThrow(message);
  });
});
