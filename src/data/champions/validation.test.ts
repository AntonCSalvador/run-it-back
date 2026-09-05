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
