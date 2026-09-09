import { describe, expect, it } from "vitest";
import { activeState, series, terminalState } from "./components/tournament-test-fixtures";
import { projectTerminalResult } from "./result-projection";
import type { TournamentState } from "./tournament";

describe("terminal result projection", () => {
  it.each([false, true])("projects a validated terminal outcome (champion %s)", champion => {
    const tournament = terminalState(champion).tournament;

    expect(projectTerminalResult(tournament)).toEqual({
      status: "valid",
      tournament,
      outcome: champion ? "champion" : "eliminated",
      stageReached: champion ? "final" : "group",
    });
  });

  it("returns an invalid projection without throwing when an existing series validator rejects a terminal series", () => {
    const active = activeState("group").tournament;
    const lost = series("group", false);
    const malformed = {
      ...active,
      status: "eliminated" as const,
      completedSeries: [{ ...lost, bestOf: 5 as const }],
    };

    expect(() => projectTerminalResult(malformed)).not.toThrow();
    expect(projectTerminalResult(malformed)).toEqual({ status: "invalid", reason: "incomplete-or-malformed" });
  });

  it("rejects a nonterminal status, skipped stage, prior loss, or mismatched current stage", () => {
    const active = activeState("quarterfinal").tournament;
    const eliminated = terminalState(false).tournament;

    expect(projectTerminalResult(active)).toEqual({ status: "invalid", reason: "incomplete-or-malformed" });
    expect(projectTerminalResult({ ...eliminated, completedSeries: [{ ...eliminated.completedSeries[0], stage: "quarterfinal" }] }).status).toBe("invalid");
    expect(projectTerminalResult({ ...activeState("semifinal").tournament, status: "eliminated", completedSeries: [series("group", false), series("quarterfinal"), series("semifinal", false)] }).status).toBe("invalid");
    expect(projectTerminalResult({ ...eliminated, currentStage: "quarterfinal" }).status).toBe("invalid");
  });

  it.each([
    ["null completed series", { completedSeries: null }],
    ["string completed series", { completedSeries: "corrupt" }],
    ["object completed series", { completedSeries: { 0: series("group", false), length: 1 } }],
    ["unknown status", { status: "finished" }],
    ["unknown current stage", { currentStage: "grand-final" }],
  ] as const)("returns invalid without throwing for runtime-corrupted %s", (_, corruption) => {
    const tournament = {
      ...terminalState(false).tournament,
      ...corruption,
    } as unknown as TournamentState;

    expect(() => projectTerminalResult(tournament)).not.toThrow();
    expect(projectTerminalResult(tournament)).toEqual({ status: "invalid", reason: "incomplete-or-malformed" });
  });
});
