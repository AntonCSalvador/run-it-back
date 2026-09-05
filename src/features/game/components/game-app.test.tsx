import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { ROLES, type Lineup } from "../domain";
import { LocalSimulationGateway } from "../gateway";
import type { Stage } from "../opponents";
import { startTournament, type SeriesResult } from "../tournament";
import { GameApp, restartCurrentRun } from "./game-app";
import { type GameState } from "../machine";
import { createDraft } from "../draft";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "../schema";
import { DAILY_RECORD, HISTORY_RECORD, STORAGE_KEYS, type DailyRun, type FreePlayRun, writeRecord } from "../storage";
import { terminalState } from "./tournament-test-fixtures";

const dataset = parseDataset(minimalDataset);
const lineup: Lineup = {
  slots: ROLES.map((role, index) => ({ role, cardId: dataset.cards[index].id })),
  iglCardId: dataset.cards[0].id,
};
const activeState: GameState = {
  phase: "tournament", mode: "daily",
  draft: { seed: "seed", offerIndex: 5, rerollsRemaining: 3, offeredTeamIds: [], selectedTeamId: null, pendingCardId: null, slots: Object.fromEntries(lineup.slots.map(slot => [slot.role, slot.cardId])), iglCardId: lineup.iglCardId },
  tournament: startTournament("seed", lineup),
};
function winningSeries(stage: Stage): SeriesResult {
  return { stage, bestOf: 3, userWins: 2, opponentWins: 0, maps: (["Ascent", "Bind"] as const).map(map => ({ map, winner: "user", userScore: 13, opponentScore: 7, probability: 0.6, roll: 0.2 })) };
}
function gatewayFixture() {
  const local = new LocalSimulationGateway(dataset);
  return {
    generateOpponent: vi.fn(local.generateOpponent.bind(local)),
    playSeries: vi.fn((_seed: string, stage: Stage) => winningSeries(stage)),
    createHighlights: vi.fn(() => []),
  };
}
function historyStorage() {
  return { length: 1, key: vi.fn(() => STORAGE_KEYS.history), getItem: vi.fn((key: string) => key === STORAGE_KEYS.history ? "keep-me" : null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; }, clear() { values.clear(); }, key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); },
  };
}

function storedRun(mode: "daily"): DailyRun;
function storedRun(mode: "free"): FreePlayRun;
function storedRun(mode: "daily" | "free"): DailyRun | FreePlayRun {
  const source = terminalState(false).tournament;
  const common = {
    completedAtUtc: "2026-09-05",
    stageReached: "group" as const, outcome: "eliminated" as const, rerollsUsed: 1,
    roster: source.userLineup.slots, iglCardId: source.userLineup.iglCardId,
    series: source.completedSeries.map(result => ({ stage: result.stage, userWins: result.userWins, opponentWins: result.opponentWins, maps: result.maps.map(map => ({ map: map.map, userScore: map.userScore, opponentScore: map.opponentScore })) })),
  };
  return mode === "daily" ? { ...common, mode, utcDate: "2026-09-05" } : { ...common, mode };
}

describe("GameApp", () => {
  it("shows saved Daily and Free Play results after reload", () => {
    const storage = memoryStorage();
    writeRecord(storage, DAILY_RECORD, { completions: [storedRun("daily")], streak: 1 });
    writeRecord(storage, HISTORY_RECORD, { runs: [storedRun("free")] });
    const first = render(<GameApp dataset={dataset} storage={storage} />);
    expect(screen.getByRole("region", { name: "Recent results" })).toHaveTextContent("Daily");
    expect(screen.getByRole("region", { name: "Recent results" })).toHaveTextContent("Free Play");
    first.unmount();
    render(<GameApp dataset={dataset} storage={storage} />);
    expect(screen.getAllByRole("button", { name: /View .* result/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "View Daily result" }));
    expect(screen.getByRole("region", { name: "Daily result details" })).toHaveTextContent("Rerolls used: 1");
  });

  it("announces recovery and non-persistent saved-result storage states", () => {
    const corrupt = memoryStorage({ [STORAGE_KEYS.daily]: "not-json" });
    const corruptView = render(<GameApp dataset={dataset} storage={corrupt} />);
    expect(screen.getByRole("status", { name: "Saved result storage status" })).toHaveTextContent("Saved results were recovered");
    corruptView.unmount();
    render(<GameApp dataset={dataset} storage={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Results cannot persist");
  });

  it("warns when storage reads or result writes throw", () => {
    const throwing: Storage = { get length() { return 0; }, clear() {}, key() { return null; }, getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
    const readView = render(<GameApp dataset={dataset} storage={throwing} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Results cannot persist");
    readView.unmount();
    const writeFailing: Storage = { ...throwing, getItem() { return null; } };
    render(<GameApp dataset={dataset} initialState={terminalState(false)} storage={writeFailing} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Results cannot persist");
  });

  it("shows draft progress and recovers invalid player, role, and IGL phases", () => {
    const draft = createDraft("bad-state", dataset);
    const team = render(<GameApp dataset={dataset} initialState={{ phase: "team", mode: "daily", draft }} />);
    expect(screen.getByText("Pick 1 of 5")).toBeVisible();
    team.unmount();
    const player = render(<GameApp dataset={dataset} initialState={{ phase: "player", mode: "daily", draft: { ...draft, selectedTeamId: "missing" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Selected team is unavailable");
    expect(screen.getByRole("button", { name: "Back to teams" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to teams" }));
    expect(screen.getByRole("heading", { name: "Choose a team" })).toBeVisible();
    player.unmount();
    const role = render(<GameApp dataset={dataset} initialState={{ phase: "role", mode: "daily", draft: { ...draft, selectedTeamId: draft.offeredTeamIds[0], pendingCardId: "missing" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No eligible role is available");
    expect(screen.getByRole("button", { name: "Back to player selection" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to player selection" }));
    expect(screen.getByRole("heading", { name: /Choose from/ })).toBeVisible();
    role.unmount();
    render(<GameApp dataset={dataset} initialState={{ phase: "lineup", mode: "daily", draft }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Roster is incomplete");
    expect(screen.getByRole("button", { name: "Restart draft" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Restart draft" }));
    expect(screen.getByText("Current phase: mode")).toBeVisible();
  });
  it("invalidates pending series work before clearing errors or resetting state", () => {
    const calls: string[] = [];
    restartCurrentRun(() => { calls.push("clear error"); }, () => { calls.push("reset state"); }, () => { calls.push("invalidate series"); });
    expect(calls).toEqual(["invalidate series", "clear error", "reset state"]);
  });

  it("keeps mode after Play and Reset in the same task without stale work or warnings", async () => {
    const gateway = gatewayFixture();
    const storage = historyStorage();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} storage={storage} />);
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Play series" }));
        fireEvent.click(screen.getByRole("button", { name: "Reset current run" }));
      });
      expect(screen.getByText("Current phase: mode")).toBeVisible();
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText("Current phase: mode")).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
      expect(gateway.playSeries).toHaveBeenCalledTimes(1);
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });

  it("discards a pending series when its core unmounts", async () => {
    const gateway = gatewayFixture();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const view = render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Play series" }));
        view.unmount();
      });
      await act(async () => { await Promise.resolve(); });
      expect(view.container).toBeEmptyDOMElement();
      expect(gateway.playSeries).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });

  it("renders an accessible wordmark and mode controls immediately", () => {
    render(<GameApp />);
    expect(screen.getByRole("heading", { name: "Run It Back", level: 1 })).toBeVisible();
    expect(screen.getByRole("group", { name: "Game mode" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Free Play" })).toBeVisible();
  });

  it("consumes one free-play seed for one StrictMode click", async () => {
    const user = userEvent.setup();
    const factory = vi.fn(() => "strict-seed");
    render(<StrictMode><GameApp freeSeedFactory={factory} /></StrictMode>);
    await user.click(screen.getByRole("button", { name: "Free Play" }));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Current phase: team")).toBeVisible();
  });

  it("recovers a failed core initialization through the real boundary restart", async () => {
    const user = userEvent.setup();
    const storage = historyStorage();
    let broken = true;
    const factory = vi.fn(() => {
      if (broken) throw new Error("gateway initialization failed");
      return gatewayFixture();
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<GameApp dataset={dataset} initialState={activeState} storage={storage} gatewayFactory={factory} />);
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
      broken = false;
      await user.click(screen.getByRole("button", { name: "Restart run" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Run It Back", level: 1 })).toBeVisible();
      expect(screen.getByRole("button", { name: "Daily" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Free Play" })).toBeVisible();
      expect(screen.getByText("Current phase: mode")).toBeVisible();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(storage.getItem(STORAGE_KEYS.history)).toBe("keep-me");
    } finally { errors.mockRestore(); }
  });

  it("locks the actual series control and applies only one group result for two same-tick clicks", async () => {
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    const button = screen.getByRole("button", { name: "Play series" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(button).toBeDisabled();
    await act(async () => { await Promise.resolve(); });
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    expect(gateway.playSeries).toHaveBeenCalledTimes(1);
    expect(gateway.generateOpponent).toHaveBeenCalledWith("seed", "group", lineup);
    expect(screen.getByRole("heading", { name: "Group stage" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeVisible();
    expect(button).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue" }));
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.generateOpponent).toHaveBeenLastCalledWith("seed", "quarterfinal", lineup);
    expect(screen.getByRole("heading", { name: "Quarterfinal" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Play series" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Semifinal" })).toBeVisible();
  });

  it("starts the selected mode when switching from an active run", async () => {
    const factory = vi.fn(() => "replacement-seed");
    render(<GameApp dataset={dataset} initialState={activeState} freeSeedFactory={factory} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Free Play" }));
    expect(screen.getByText("Current phase: team")).toBeVisible();
    expect(screen.getByRole("button", { name: "Free Play" })).toHaveAttribute("aria-pressed", "true");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("catches reducer errors from a series result and restarts the core", async () => {
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => winningSeries("quarterfinal"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
      await userEvent.setup().click(screen.getByRole("button", { name: "Play series" }));
      await userEvent.setup().click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
      await userEvent.setup().click(screen.getByRole("button", { name: "Restart run" }));
      expect(screen.getByText("Current phase: mode")).toBeVisible();
    } finally { errors.mockRestore(); }
  });

  it.each(["generateOpponent", "playSeries"] as const)("resets a real %s error and can start another mode without deleting history", async method => {
    const user = userEvent.setup();
    const storage = historyStorage();
    const gateway = gatewayFixture();
    gateway[method].mockImplementation(() => { throw new Error("simulation failed"); });
    render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} storage={storage} />);
    if (method === "generateOpponent") expect(screen.getByRole("alert")).toHaveTextContent("No valid opponent is available");
    else { await user.click(screen.getByRole("button", { name: "Play series" })); expect(screen.getByRole("alert")).toHaveTextContent("Unable to play the current series"); }
    await user.click(screen.getByRole("button", { name: "Reset current run" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Current phase: mode")).toBeVisible();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEYS.history)).toBe("keep-me");
    await user.click(screen.getByRole("button", { name: "Daily" }));
    expect(screen.getByText("Current phase: team")).toBeVisible();
  });

  it("resets an active run immediately when the dataset identity changes", () => {
    const gateway = gatewayFixture();
    const view = render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    expect(screen.getByRole("button", { name: "Play series" })).toBeVisible();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    view.rerender(<GameApp dataset={parseDataset(minimalDataset)} initialState={activeState} gateway={gateway} />);
    expect(screen.getByText("Current phase: mode")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Play series" })).not.toBeInTheDocument();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    view.rerender(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    expect(screen.getByText("Current phase: mode")).toBeVisible();
  });
});
