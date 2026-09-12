import { describe, expect, it, vi } from "vitest";
import evidence from "./evidence.json";
import { championsDataset } from "./index";
import { applyPortraitCatalog, parsePortraitCatalog, validatePortraitCatalog } from "./portrait-catalog";
import { assessPortrait } from "./portrait-policy";
import { validateChampions, type Evidence } from "./validation";

const player = { id: "player-1", canonicalHandle: "BeYN", portrait: null, sourceIds: ["fact"] };
const row = { playerId: "player-1", portrait: "/assets/players/player-1.abcdef123456.webp", sourceId: "liquipedia-portrait-1", sha256: "a".repeat(64) };
const liquipediaSource = { id: row.sourceId, url: "https://liquipedia.net/commons/File:BeYN.jpg", originalUrl: "https://www.flickr.com/photos/valorantesports/54347821048/", retrievedAt: "2026-09-08", usage: "asset" as const, credit: "Liu YiCun / Riot Games", license: "permission", sourceKind: "liquipedia" as const, reuseBasis: "riot-fan-policy" as const, copyrightOwner: "Riot Games" };
const riotRow = { ...row, sourceId: "riot-vct-portrait-1" };
const riotSource = { id: riotRow.sourceId, url: "https://valorantesports.com/en-US/", originalUrl: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/portrait.png", retrievedAt: "2026-09-09", usage: "asset" as const, credit: "VALORANT Esports / Riot Games", license: "Riot Legal Jibber Jabber", sourceKind: "riot-portrait" as const, reuseBasis: "riot-fan-policy" as const, copyrightOwner: "Riot Games" };
const overlaidPlayer = applyPortraitCatalog([player], [row])[0];

describe("portrait catalog", () => {
  it("rejects a catalog with one player omitted when complete coverage is required", () => {
    const second = { ...player, id: "player-2", canonicalHandle: "Second" };
    expect(() => validatePortraitCatalog([player, second], [row], [liquipediaSource], { requireCompleteCoverage: true }))
      .toThrow(/portrait coverage.*Second.*player-2/);
  });
  it("overlays portrait and appends only its asset source", () => {
    expect(applyPortraitCatalog([player], [row])).toEqual([{ ...player, portrait: row.portrait, sourceIds: ["fact", row.sourceId] }]);
  });

  it("rejects duplicate, orphaned, remote, or incomplete records", () => {
    expect(() => validatePortraitCatalog([player], [row, row], [liquipediaSource])).toThrow(/duplicate player/);
    expect(() => validatePortraitCatalog([player], [{ ...row, playerId: "missing" }], [liquipediaSource])).toThrow(/orphan player/);
    expect(() => validatePortraitCatalog([player], [{ ...row, portrait: "https://example.test/a.webp" }], [liquipediaSource])).toThrow(/local asset/);
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, credit: "" }])).toThrow(/credit/);
  });

  it("rejects mismatched numeric identities during catalog parsing", () => {
    expect(() => parsePortraitCatalog([{ ...row, portrait: "/assets/players/player-2.abcdef123456.webp", sourceId: "liquipedia-portrait-3" }])).toThrow(/identity mismatch/);
  });

  it("accepts structured Liquipedia and Riot portrait provenance", () => {
    expect(() => validatePortraitCatalog([player], [row], [liquipediaSource])).not.toThrow();
    expect(() => validatePortraitCatalog([player], [riotRow], [riotSource])).not.toThrow();
  });

  it("rejects portrait source kinds outside their ID namespace", () => {
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, sourceKind: "riot-portrait" }])).toThrow(/source namespace/);
  });

  it("requires structured portrait provenance fields", () => {
    const missing: Record<string, unknown> = { ...liquipediaSource };
    delete missing.sourceKind;
    expect(() => validatePortraitCatalog([player], [row], [missing])).toThrow(/structured portrait provenance/);
  });

  it("requires every portrait-prefixed source to be an asset catalog record", () => {
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, usage: "facts" }])).toThrow(/usage asset/);
    expect(() => validatePortraitCatalog([player], [], [{ ...liquipediaSource, id: "liquipedia-portrait-2", usage: "facts" }])).toThrow(/usage asset/);
  });

  it("rejects an otherwise valid unused portrait source in the passed dataset", () => {
    const data = structuredClone(championsDataset);
    let number = 1;
    while (data.sources.some(candidate => candidate.id === `liquipedia-portrait-${number}`)) number += 1;
    data.sources.push({ ...liquipediaSource, id: `liquipedia-portrait-${number}` });
    expect(() => validateChampions(data, evidence as Evidence[])).toThrow(/unused portrait source/);
  });

  it("requires final players to match their portrait overlays exactly", () => {
    expect(() => validatePortraitCatalog([overlaidPlayer], [row], [liquipediaSource], { requireOverlay: true })).not.toThrow();
    expect(() => validatePortraitCatalog([{ ...overlaidPlayer, portrait: "/assets/players/player-1.123456abcdef.webp" }], [row], [liquipediaSource], { requireOverlay: true })).toThrow(/portrait overlay/);
    expect(() => validatePortraitCatalog([{ ...overlaidPlayer, portrait: null }], [row], [liquipediaSource], { requireOverlay: true })).toThrow(/portrait overlay/);
    expect(() => validatePortraitCatalog([{ ...overlaidPlayer, sourceIds: ["fact", "liquipedia-portrait-2"] }], [row], [liquipediaSource], { requireOverlay: true })).toThrow(/portrait source overlay/);
    expect(() => validatePortraitCatalog([{ ...overlaidPlayer, sourceIds: ["fact", row.sourceId, "liquipedia-portrait-2"] }], [row], [liquipediaSource], { requireOverlay: true })).toThrow(/portrait source overlay/);
  });

  it("requires players without overlays to keep portrait fields empty", () => {
    expect(() => validatePortraitCatalog([{ ...player, portrait: row.portrait }], [], [], { requireOverlay: true })).toThrow(/portrait overlay/);
    expect(() => validatePortraitCatalog([{ ...player, sourceIds: ["fact", row.sourceId] }], [], [], { requireOverlay: true })).toThrow(/portrait source overlay/);
  });

  it("accepts approved reuse grounds and rejects unsupported claims", () => {
    expect(() => validatePortraitCatalog([player], [row], [liquipediaSource])).not.toThrow();
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, license: "cc-by-sa-4.0", credit: "Example Photographer", originalUrl: "https://example.test/photo", reuseBasis: "open-license", copyrightOwner: "Example Photographer" }])).not.toThrow();
    for (const invalid of [
      { license: "fair use" },
      { license: "cc-by-nd-4.0" },
      { license: "unknown-rights-marker" },
      { credit: "Example Team" },
      { credit: "Example Photographer" },
      { credit: "Riot Games" },
      { credit: "Photographer / Riot Games All Rights Reserved. / Example Team" },
      { originalUrl: "https://example.test/riot-photo" },
    ]) expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, ...invalid }])).toThrow(/reuse grounds/);
  });

  it("requires Riot Games ownership for Liquipedia Riot-policy sources", () => {
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, copyrightOwner: "Example Photographer" }])).toThrow(/reuse grounds/);
  });

  it("requires Riot Games ownership for Riot/VCT reuse bases", () => {
    expect(() => validatePortraitCatalog([player], [riotRow], [{ ...riotSource, reuseBasis: "open-license", license: "cc-by-4.0", copyrightOwner: "Example Photographer" }])).toThrow(/reuse grounds/);
    expect(() => validatePortraitCatalog([player], [riotRow], [{ ...riotSource, reuseBasis: "explicit-permission", license: "permission", permissionUrl: "https://riotgames.com/en/legal", copyrightOwner: "Example Photographer" }])).toThrow(/reuse grounds/);
  });

  it("requires explicit permission evidence from an approved Riot/VCT page", () => {
    expect(() => validatePortraitCatalog([player], [riotRow], [{ ...riotSource, reuseBasis: "explicit-permission", license: "permission", permissionUrl: "https://example.test/permission" }])).toThrow(/reuse grounds/);
  });

  it("accepts recognized Riot Games copyright-owner variants", () => {
    expect(() => validatePortraitCatalog([player], [riotRow], [{ ...riotSource, copyrightOwner: "Riot Games, Inc." }])).not.toThrow();
  });

  it("rejects malformed and future retrieval dates", () => {
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, retrievedAt: "2026-02-30" }], { today: "2026-09-09" })).toThrow(/retrievedAt|retrieval date/);
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, retrievedAt: "2026-09-10" }], { today: "2026-09-09" })).toThrow(/future retrieval date/);
  });

  it("derives the default validation date from its injected clock", () => {
    const future = [{ ...liquipediaSource, retrievedAt: "2026-09-10" }];
    expect(() => validatePortraitCatalog([player], [row], future, { now: () => new Date(2026, 8, 10, 12) })).not.toThrow();
    expect(() => validatePortraitCatalog([player], [row], future, { now: () => new Date(2026, 8, 9, 12) })).toThrow(/future retrieval date/);
  });

  it("accepts importer-derived Riot ownership credits with the approved legal suffix", () => {
    const assessment = assessPortrait("BeYN", "File:BeYN.jpg", `{{FileInfo
|featured=BeYN
|date=2025-02-24
|license=permission
|author=Photographer
|copyright=Riot Games All Rights Reserved.
|source=https://www.flickr.com/photos/valorantesports/54347821048/
}}`);
    expect(assessment).toMatchObject({ accepted: true, credit: "Photographer / Riot Games All Rights Reserved." });
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, credit: assessment.credit, license: assessment.license, originalUrl: assessment.source }])).not.toThrow();
  });

  it("accepts importer-derived credits with a multi-part author", () => {
    const assessment = assessPortrait("BeYN", "File:BeYN.jpg", `{{FileInfo
|featured=BeYN
|date=2025-02-24
|license=permission
|author=Photo / Video Team
|copyright=Riot Games
|source=https://www.flickr.com/photos/valorantesports/54347821048/
}}`);
    expect(assessment).toMatchObject({ accepted: true, credit: "Photo / Video Team / Riot Games" });
    expect(() => validatePortraitCatalog([player], [row], [{ ...liquipediaSource, credit: assessment.credit, license: assessment.license, originalUrl: assessment.source }])).not.toThrow();
  });

  it("imports the Champions dataset when the application clock predates portrait retrieval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15, 12));
    vi.resetModules();
    try {
      const fresh = await import("./index");
      expect(fresh.championsDataset.players.some(player => player.portrait !== null)).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.resetModules();
    }
  });
});
