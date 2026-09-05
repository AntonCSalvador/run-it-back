import { describe, expect, it } from "vitest";
import evidence from "./evidence.json";
import { championsDataset } from "./index";
import { validateChampions, type Evidence } from "./validation";
import raw from "./raw-extraction.json";

describe("Champions audit validation", () => {
  it("accepts the full committed derivation", () => {
    expect(() => validateChampions(championsDataset, evidence as Evidence[])).not.toThrow();
  });

  it("rejects tampered raw inputs before deriving evidence", () => {
    const wins = raw.cards[0].clutchWins;
    try {
      raw.cards[0].clutchWins++;
      expect(() => validateChampions(championsDataset, evidence as Evidence[])).toThrow(/raw extraction checksum/);
    } finally { raw.cards[0].clutchWins = wins; }
  });

  it("rejects coherent mutations of participation, coverage, class counts, and leadership", () => {
    const data = structuredClone(championsDataset);
    const altered = structuredClone(evidence) as Evidence[];
    data.cards[0].mapsPlayed++;
    altered[0].mapsPlayed++;
    altered[0].agentClassMaps.smokes++;
    expect(() => validateChampions(data, altered)).toThrow(/raw mapsPlayed|raw class/);
    const counts = structuredClone(evidence) as Evidence[];
    counts[0].agentClassMaps.smokes--;
    counts[0].agentClassMaps.duelist++;
    expect(() => validateChampions(championsDataset, counts)).toThrow(/raw class counts/);
    const falseLeader = structuredClone(championsDataset);
    falseLeader.cards[0].historicalIgl = true;
    falseLeader.cards[0].traits.leadership = 75;
    falseLeader.cards[0].sourceIds.push("riot-vct-2023-awards");
    expect(() => validateChampions(falseLeader, evidence as Evidence[])).toThrow(/raw historicalIgl|trait leadership/);
  });
  it.each(["reason", "empty citations", "unknown citation", "extraneous"])("rejects %s overrides even on threshold-satisfying cards", kind => {
    const altered = structuredClone(evidence) as Evidence[];
    altered[0].override = { roles: ["smokes"], reason: kind === "reason" ? " " : "Reviewed role", sourceIds: kind === "empty citations" ? [] : [kind === "unknown citation" ? "missing" : "vct-reference-dataset"] };
    expect(() => validateChampions(championsDataset, altered)).toThrow(/override/);
  });

  it("rejects a plausible but unobserved clutch win", () => {
    const altered = structuredClone(evidence) as Evidence[];
    altered.find(row => row.cardId === "ade-crazy-raccoon-2021")!.clutchWins = 3;
    expect(() => validateChampions(championsDataset, altered)).toThrow(/clutch|raw/);
  });

  it("rejects fabricated partial coverage even when clutch is neutral", () => {
    const altered = structuredClone(evidence) as Evidence[];
    const data = structuredClone(championsDataset);
    altered.find(row => row.cardId === "ade-crazy-raccoon-2021")!.clutchCoverageMaps = 3;
    data.cards.find(card => card.id === "ade-crazy-raccoon-2021")!.traits.clutch = 50;
    expect(() => validateChampions(data, altered)).toThrow(/coverage|raw|trait/);
  });

  it.each(["firepower", "utility", "survival", "clutch", "consistency"] as const)("rejects arbitrary %s traits", trait => {
    const data = structuredClone(championsDataset);
    data.cards.find(card => card.id === "ade-crazy-raccoon-2021")!.traits[trait] = 99;
    expect(() => validateChampions(data, evidence as Evidence[])).toThrow(/trait/);
  });

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

  it("rejects mutated audit semantics", () => {
    const reject = (mutate: (data: Evidence[]) => void, message: RegExp) => { const data = structuredClone(evidence) as Evidence[]; mutate(data); expect(() => validateChampions(championsDataset, data)).toThrow(message); };
    reject(data => { data[0].finalEligibleRoles = ["flex"]; }, /final roles|flex/);
    reject(data => { data[0].suggestedRoles = ["sentinel"]; }, /suggested roles/);
    reject(data => { data[0].agentClassMaps.smokes += 1; }, /class counts/);
    reject(data => { data[0].agentClassMaps.smokes = -1; }, /class counts/);
    reject(data => { data[0].agentClassMaps.smokes = 1.5; }, /class counts/);
    reject(data => { data[0].sourceIds = ["missing"]; }, /evidence sources/);
    reject(data => { const lakia = data.find(entry => entry.cardId === "lakia-vision-strikers-2021")!; lakia.override!.sourceIds = []; }, /threshold override/);
    reject(data => { const lakia = data.find(entry => entry.cardId === "lakia-vision-strikers-2021")!; lakia.override!.sourceIds = ["missing"]; }, /threshold override/);
    reject(data => { const lakia = data.find(entry => entry.cardId === "lakia-vision-strikers-2021")!; lakia.override!.reason = " "; }, /threshold override/);
    reject(data => { data[0].clutchWins = -1; }, /clutch evidence/);
    reject(data => { const partial = data.find(entry => entry.clutchCoverageMaps < entry.mapsPlayed)!; partial.clutchWins = 999; }, /clutch evidence|clutch coverage/);
  });
});
