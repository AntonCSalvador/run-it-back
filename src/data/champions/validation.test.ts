import { describe, expect, it } from "vitest";
import evidence from "./evidence.json";
import { championsDataset } from "./index";
import { validateChampions, type Evidence } from "./validation";

describe("Champions audit validation", () => {
  it("rejects missing evidence and uncited below-threshold role claims", () => {
    expect(() => validateChampions(championsDataset, evidence.slice(1) as Evidence[])).toThrow(/evidence/i);
    const altered = structuredClone(evidence) as Evidence[];
    const lakia = altered.find(entry => entry.cardId === "lakia-vision-strikers-2021")!;
    lakia.override = null;
    expect(() => validateChampions(championsDataset, altered)).toThrow(/threshold|override/i);
  });

  it("rejects assets without an asset credit and license source", () => {
    const altered = structuredClone(championsDataset);
    altered.teams[0].logo = "/assets/teams/unlicensed.svg";
    expect(() => validateChampions(altered, evidence as Evidence[])).toThrow(/asset provenance/i);
  });
});
