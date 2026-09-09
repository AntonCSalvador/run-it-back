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

  it("rejects conflicting rights metadata instead of choosing a duplicate field", () => {
    const conflicts = [
      ["license", "cc-by-sa-4.0", "permission"],
      ["copyright", "Example Team", "[https://www.riotgames.com/ Riot Games]"],
      ["note", "Team permission only", "Used With Permission. All rights remain with Riot Games."],
    ];

    for (const [field, conflictingValue, acceptedValue] of conflicts) {
      const info = riot.replace(
        `|${field}=${acceptedValue}`,
        `|${field}=${conflictingValue}\n|${field}=${acceptedValue}`,
      );
      expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", info)).toMatchObject({
        accepted: false,
        basis: null,
        reason: "metadata-incomplete",
      });
    }
  });

  it.each([
    ["license", "permission"],
    ["featured", "BeYN"],
  ])("rejects repeated identical %s fields", (field, value) => {
    const info = riot.replace(
      `|${field}=${value}`,
      `|${field}=${value}\n|${field}=${value}`,
    );

    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", info)).toMatchObject({
      accepted: false,
      basis: null,
      reason: "metadata-incomplete",
    });
  });

  it("supports distinct numbered featured fields", () => {
    expect(
      assessPortrait(
        "BeYN",
        "File:DRX BeYN.jpg",
        riot.replace("featured=BeYN", "featured=MaKo\n|featured2=BeYN"),
      ),
    ).toMatchObject({ accepted: true, featured: ["MaKo", "BeYN"] });
  });

  it("requires case-exact normalized featured handles", () => {
    expect(
      assessPortrait(
        "BeYN",
        "File:DRX BeYN.jpg",
        riot.replace("featured=BeYN", "featured=beyn"),
      ),
    ).toMatchObject({ accepted: false, reason: "identity-mismatch" });
  });

  it("rejects ambiguous copyright text containing Riot Games", () => {
    expect(
      assessPortrait(
        "BeYN",
        "File:DRX BeYN.jpg",
        riot.replace(
          "[https://www.riotgames.com/ Riot Games]",
          "Example Team; Riot Games trademark",
        ),
      ),
    ).toMatchObject({ accepted: false, reason: "rights-rejected" });
  });

  it("normalizes wiki links and source links before policy checks", () => {
    const info = riot
      .replace("featured=BeYN", "featured=[[BeYN]]")
      .replace(
        "source=https://www.flickr.com/photos/valorantesports/54347821048/",
        "source=[https://www.flickr.com/photos/valorantesports/54347821048/ Riot source]",
      );

    expect(parseFileInfo(info).source).toBe(
      "https://www.flickr.com/photos/valorantesports/54347821048/",
    );
    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", info)).toMatchObject({
      accepted: true,
      featured: ["BeYN"],
    });
  });

  it("parses fields case-insensitively and chooses the newest unambiguous image", () => {
    const mixedCaseFields = riot
      .replace("featured=", "FeAtUrEd=")
      .replace("date=", "DaTe=")
      .replace("license=", "LiCeNsE=")
      .replace("author=", "AuThOr=")
      .replace("copyright=", "CoPyRiGhT=")
      .replace("note=", "NoTe=")
      .replace("source=", "SoUrCe=");
    expect(parseFileInfo(mixedCaseFields)).toMatchObject({
      featured: ["BeYN"],
      date: "2025-02-24",
      license: "permission",
      author: "Liu YiCun",
      copyright: "Riot Games",
      source: "https://www.flickr.com/photos/valorantesports/54347821048/",
    });
    const older = assessPortrait(
      "BeYN",
      "File:old.jpg",
      riot.replace("2025-02-24", "2024-01-01"),
    );
    const newer = assessPortrait("BeYN", "File:new.jpg", riot);
    expect(choosePortrait([older, newer])).toMatchObject({
      kind: "selected",
      candidate: { fileTitle: "File:new.jpg" },
    });
    const tied = assessPortrait("BeYN", "File:tied.jpg", riot);
    expect(
      choosePortrait([newer, tied]),
    ).toEqual({
      kind: "ambiguous",
      candidates: ["File:new.jpg", "File:tied.jpg"],
    });
  });
});
