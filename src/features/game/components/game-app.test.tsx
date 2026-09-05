import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ROLES, type Lineup } from "../domain";
import type { GeneratedOpponent } from "../opponents";
import type { SeriesResult } from "../tournament";
import { ErrorBoundary } from "./error-boundary";
import { GameApp, playCurrentTournamentSeries, restartCurrentRun } from "./game-app";
import { createGameReducer, initialGameState, type GameState } from "../machine";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "../schema";
import { startTournament } from "../tournament";

describe("GameApp", () => {
  it("renders an accessible wordmark and mode controls immediately", () => {
    render(<GameApp />);
    expect(screen.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Free Play" })).toBeVisible();
  });

  it("recovers a broken subtree without clearing browser storage", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("run-it-back:history:v1", "keep-me");
    const Broken = () => { throw new Error("boom"); };
    render(<ErrorBoundary onRestart={() => undefined}><Broken /></ErrorBoundary>);
    expect(screen.getByText(/something went wrong/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restart run" }));
    expect(window.localStorage.getItem("run-it-back:history:v1")).toBe("keep-me");
  });

  it("uses the injected gateway to resolve the current tournament series", () => {
    const lineup: Lineup = { slots: ROLES.map(role => ({ role, cardId: `${role}-card` })), iglCardId: "smokes-card" };
    const state: GameState = { phase: "tournament", mode: "daily", draft: { seed: "seed", offerIndex: 5, rerollsRemaining: 3, offeredTeamIds: [], selectedTeamId: null, pendingCardId: null, slots: Object.fromEntries(lineup.slots.map(slot => [slot.role, slot.cardId])), iglCardId: lineup.iglCardId }, tournament: startTournament("seed", lineup) };
    const opponent = {} as GeneratedOpponent;
    const series = {} as SeriesResult;
    const gateway = { generateOpponent: vi.fn(() => opponent), playSeries: vi.fn(() => series), createHighlights: vi.fn() };
    expect(playCurrentTournamentSeries(state, gateway)).toEqual({ type: "resolve-series", series });
    expect(gateway.generateOpponent).toHaveBeenCalledWith("seed", "group", lineup);
    expect(gateway.playSeries).toHaveBeenCalledWith("seed", "group", lineup, opponent);
  });

  it("clears a simulation error and returns the current run to mode on restart", () => {
    const reduce = createGameReducer({ dataset: parseDataset(minimalDataset) });
    let state = reduce(initialGameState, { type: "start", mode: "daily" });
    let simulationError: string | null = "Unable to play the current series. Please restart the run.";
    restartCurrentRun(() => { simulationError = null; }, action => { state = reduce(state, action); });
    expect(simulationError).toBeNull();
    expect(state.phase).toBe("mode");
  });
});
