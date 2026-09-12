import { describe, expect, it } from "vitest";
import { parsePortraitOverrides } from "./portrait-overrides";
import { championsDataset } from "./index";
import productionOverrides from "./portrait-overrides.json";

const cohort2021 = ["Witz", "v1xen", "doma", "sheydos", "gtn", "MAGNUM", "dispenser", "Patiphan", "d3ffo", "Klaus", "Sushiboys", "SuperBusS", "SantaGolf", "SicK", "dapr", "Chronicle", "ShahZaM", "zombs", "mitch", "frz", "xand", "nzr", "saadhak", "k1Ng", "Lakia", "murizzz", "FiNESSE", "mazin"];
const cohort2022 = ["Enzo", "Famouz", "xffero", "mindfreak"];
const cohort2023 = ["something", "Demon1", "DaveeyS", "DK", "Sayf", "carpe", "MOJJ", "nizhaoTZH", "ban", "AtaKaptan", "MrFaliN"];
const cohort2024Overrides = ["Kicks", "Foxy9", "johnqt", "JitBoyS", "MiniBoo", "Wo0t", "runneR", "primmie", "hiro", "benjyfishy", "Karon", "Governor", "Flex1n", "heybay", "yetujey", "Autumn", "t3xture"];
const cohort2025Overrides = ["skuba", "ara", "keiko", "Nicc", "PatMen", "crazyguy", "kamo", "brawk", "Jemkin", "iZu", "paTiTek", "SpiritZ1", "DH", "Kushy", "mada", "Akeman", "grubinho", "artzin", "Monyet", "kaajak"];

function missingOverrideHandles(handles: readonly string[]) {
  const reviewed = new Set(parsePortraitOverrides(productionOverrides, championsDataset.players).map(row => row.playerId));
  return handles.filter(handle => !championsDataset.players.some(player => player.canonicalHandle === handle && reviewed.has(player.id)));
}

it("2021 portrait cohort has a reviewed override for every required player", () => {
  expect(missingOverrideHandles(cohort2021)).toEqual([]);
});

it("2022 portrait cohort has a reviewed override for every required player", () => {
  expect(missingOverrideHandles(cohort2022)).toEqual([]);
});

it("2023 portrait cohort has a reviewed override for every required player", () => {
  expect(missingOverrideHandles(cohort2023)).toEqual([]);
});

it("2024 portrait cohort has a reviewed override for every required player", () => {
  expect(missingOverrideHandles(cohort2024Overrides)).toEqual([]);
});

it("2025 portrait cohort has a reviewed override for every required player", () => {
  expect(missingOverrideHandles(cohort2025Overrides)).toEqual([]);
});

it("records the reviewed DaveeyS Flickr publication date", () => {
  const reviewed = parsePortraitOverrides(productionOverrides, championsDataset.players);
  expect(reviewed.find(row => row.playerId === "player-2764")?.sourcePublishedAt).toBe("2023-02-23");
});

it("keeps all reviewed portrait cohorts unique and complete", () => {
  const reviewed = parsePortraitOverrides(productionOverrides, championsDataset.players);
  expect(reviewed).toHaveLength(80);
  expect(new Set(reviewed.map(row => row.playerId)).size).toBe(80);
});

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
  it("accepts the reviewed Liquipedia riot template with a verified Korean Riot origin", () => {
    const row = { ...officialStill, sourceKind: "liquipedia", sourcePageUrl: "https://liquipedia.net/commons/File:K1Ng_at_First_Strike_Korea.jpg", mediaUrl: "https://liquipedia.net/commons/images/1/1c/K1Ng_at_First_Strike_Korea.jpg", originalUrl: "https://www.flickr.com/photos/145885012@N07/50684034008/", credit: "Riot Games Korea / Riot Games", license: "riot" };
    expect(parsePortraitOverrides([row], players)).toEqual([row]);
    expect(() => parsePortraitOverrides([{ ...row, copyrightOwner: "Unknown" }], players)).toThrow();
    expect(() => parsePortraitOverrides([{ ...row, originalUrl: "https://www.flickr.com/photos/unverified/123/" }], players)).toThrow();
  });
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
