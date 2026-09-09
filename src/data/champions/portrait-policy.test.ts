import { describe, expect, it } from "vitest";
import { assessPortrait, choosePortrait, parseFileInfo } from "./portrait-policy";

const riot = `{{FileInfo
|featured=BeYN
|date=2025-02-24
|license=permission
|author=Liu YiCun
|copyright=[https://www.riotgames.com/ Riot Games]
|note=Used With Permission. All rights remain with Riot Games.
|source=https://www.flickr.com/photos/valorantesports/54347821048/
}}`;

describe("portrait source policy", () => {
  it("accepts a Riot-owned player portrait under the noncommercial fan policy", () => {
    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", riot)).toMatchObject({
      accepted: true,
      basis: "riot-fan-policy",
      featured: ["BeYN"],
      credit: "Liu YiCun / Riot Games",
    });
  });

  it.each([
    ["fairuse", "[https://www.riotgames.com/ Riot Games]"],
    ["permission", "[https://team.example/ Example Team]"],
    ["permission", ""],
    ["cc-by-nd-3.0", "Example Photographer"],
  ])("rejects license %s with owner %s", (license, copyright) => {
    const info = riot
      .replace("license=permission", `license=${license}`)
      .replace("[https://www.riotgames.com/ Riot Games]", copyright);
    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", info).accepted).toBe(false);
  });

  it("accepts redistributable non-ND Creative Commons media", () => {
    const info = riot
      .replace("license=permission", "license=cc-by-sa-4.0")
      .replace(
        "[https://www.riotgames.com/ Riot Games]",
        "Example Photographer",
      );
    expect(assessPortrait("BeYN", "File:BeYN.jpg", info)).toMatchObject({
      accepted: true,
      basis: "open-license",
    });
  });

  it("requires FileInfo to feature the exact normalized player handle", () => {
    expect(
      assessPortrait(
        "BeYN",
        "File:DRX BeYN.jpg",
        riot.replace("featured=BeYN", "featured=MaKo"),
      ).accepted,
    ).toBe(false);
  });

  it("parses fields case-insensitively and chooses the newest unambiguous image", () => {
    expect(parseFileInfo(riot).date).toBe("2025-02-24");
    const older = {
      ...assessPortrait(
        "BeYN",
        "File:old.jpg",
        riot.replace("2025-02-24", "2024-01-01"),
      ),
      fileTitle: "File:old.jpg",
    };
    const newer = {
      ...assessPortrait("BeYN", "File:new.jpg", riot),
      fileTitle: "File:new.jpg",
    };
    expect(choosePortrait([older, newer])).toMatchObject({
      kind: "selected",
      candidate: { fileTitle: "File:new.jpg" },
    });
    expect(
      choosePortrait([newer, { ...newer, fileTitle: "File:tied.jpg" }]),
    ).toEqual({
      kind: "ambiguous",
      candidates: ["File:new.jpg", "File:tied.jpg"],
    });
  });
});
