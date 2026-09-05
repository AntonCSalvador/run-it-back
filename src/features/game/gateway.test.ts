import { describe, expect, it } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { LocalSimulationGateway } from "./gateway";
import type { Lineup } from "./domain";

const lineup: Lineup = { slots: ["smokes", "duelist", "initiator", "sentinel", "flex"].map((role, index) => ({ role: role as Lineup["slots"][number]["role"], cardId: minimalDataset.cards[index].id })), iglCardId: minimalDataset.cards[0].id };
describe("LocalSimulationGateway", () => {
  it("owns a cloned validated dataset and composes opponent, series, and highlights", () => {
    const source = structuredClone(minimalDataset); const gateway = new LocalSimulationGateway(source as never);
    source.cards[10].traits.firepower = 0;
    const opponent = gateway.generateOpponent("gateway", "semifinal", lineup);
    expect(opponent.lineup.slots.every(slot => !lineup.slots.some(own => own.cardId === slot.cardId))).toBe(true);
    const series = gateway.playSeries("gateway", "semifinal", lineup, opponent);
    expect(series.stage).toBe("semifinal");
    expect(Object.isFrozen(gateway)).toBe(false);
    expect(Object.isFrozen(gateway.createHighlights("gateway", series, lineup, opponent.lineup))).toBe(true);
  });
});
