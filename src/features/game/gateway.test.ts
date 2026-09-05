import { describe, expect, it } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { LocalSimulationGateway } from "./gateway";
import type { Lineup } from "./domain";

const lineup: Lineup = { slots: ["smokes", "duelist", "initiator", "sentinel", "flex"].map((role, index) => ({ role: role as Lineup["slots"][number]["role"], cardId: minimalDataset.cards[index].id })), iglCardId: minimalDataset.cards[0].id };
describe("LocalSimulationGateway", () => {
  it("owns a cloned validated dataset and composes opponent, series, and highlights", () => {
    const source = structuredClone(minimalDataset); const control = structuredClone(minimalDataset); const gateway = new LocalSimulationGateway(source as never); const baseline = new LocalSimulationGateway(control as never);
    source.cards[10].traits.firepower = 0; source.cards[10].eligibleRoles.push("smokes");
    const opponent = gateway.generateOpponent("gateway", "semifinal", lineup); const controlOpponent = baseline.generateOpponent("gateway", "semifinal", lineup);
    const internal = (gateway as unknown as { dataset: typeof minimalDataset }).dataset;
    expect(Object.isFrozen(internal)).toBe(true); expect(Object.isFrozen(internal.cards)).toBe(true); expect(Object.isFrozen(internal.cards[0])).toBe(true); expect(Object.isFrozen(internal.cards[0].traits)).toBe(true);
    expect(opponent).toEqual(controlOpponent);
    expect(opponent.lineup.slots.every(slot => !lineup.slots.some(own => own.cardId === slot.cardId))).toBe(true);
    const series = gateway.playSeries("gateway", "semifinal", lineup, opponent);
    expect(series.stage).toBe("semifinal");
    expect(Object.isFrozen(gateway.createHighlights("gateway", series, lineup, opponent.lineup))).toBe(true);
  });
});
