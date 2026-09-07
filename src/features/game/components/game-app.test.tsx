import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { ROLES, type Lineup } from "../domain";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import type { Stage } from "../opponents";
import { startTournament, type SeriesResult } from "../tournament";
import { GameApp, restartCurrentRun } from "./game-app";
import { type GameState } from "../machine";
import { createDraft } from "../draft";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "../schema";
import { DAILY_RECORD, HISTORY_RECORD, STORAGE_KEYS, type DailyRun, type FreePlayRun, writeRecord } from "../storage";
import { activeState as tournamentState, series, terminalState } from "./tournament-test-fixtures";
import { dailySeed } from "../rng";

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
    createHighlights: vi.fn<SimulationGateway["createHighlights"]>(() => []),
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
  it.each([
    ["daily", "daily", STORAGE_KEYS.daily, "Start Daily"],
    ["Free Play", "free-play", STORAGE_KEYS.history, "Start Free Play"],
  ] as const)("does not persist or share a malformed %s terminal result", (_, mode, storageKey, recoveryLabel) => {
    const storage = memoryStorage();
    const valid = terminalState(false);
    const initialState: GameState = {
      ...valid,
      mode,
      tournament: {
        ...valid.tournament,
        completedSeries: valid.tournament.completedSeries.map(result => ({ ...result, bestOf: 5 })),
      },
    };

    render(<GameApp dataset={dataset} initialState={initialState} storage={storage} />);

    expect(screen.getByRole("heading", { name: "Tournament recap unavailable" })).toHaveFocus();
    expect(within(screen.getByRole("navigation", { name: "Run progress" })).getByRole("status")).toHaveTextContent("Recap unavailable");
    expect(screen.getByRole("navigation", { name: "Run progress" })).not.toHaveTextContent("Run complete");
    expect(screen.queryByRole("button", { name: "Share result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Share result" })).not.toBeInTheDocument();
    expect(storage.getItem(storageKey)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.daily)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: recoveryLabel }));
    expect(screen.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
  });

  it("recovers without sharing or persistence when an injected terminal run has a non-array series collection", () => {
    const storage = memoryStorage();
    const valid = terminalState(false);
    const initialState = {
      ...valid,
      tournament: { ...valid.tournament, completedSeries: null },
    } as unknown as GameState;

    expect(() => render(<GameApp dataset={dataset} initialState={initialState} storage={storage} />)).not.toThrow();
    expect(screen.getByRole("heading", { name: "Tournament recap unavailable" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Share result" })).not.toBeInTheDocument();
    expect(storage.getItem(STORAGE_KEYS.daily)).toBeNull();
  });

  it("carries retained significant moments into the recap and keeps saved history below it", async () => {
    const gateway = gatewayFixture();
    const clutch = {
      id: "clutch", kind: "clutch" as const, actorCardId: lineup.iglCardId, side: "user" as const,
      text: "Repository-authored clutch moment.", emphasis: "clutch" as const, map: "Ascent" as const, mapIndex: 0,
    };
    const normal = { ...clutch, id: "normal", kind: "ace" as const, text: "Routine narration.", emphasis: "normal" as const };
    gateway.playSeries.mockImplementation((_seed, stage) => series(stage, false));
    gateway.createHighlights.mockImplementation(() => [normal, clutch]);
    render(<GameApp dataset={dataset} initialState={tournamentState("semifinal")} gateway={gateway} storage={memoryStorage()} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Play semifinal" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to results" }));

    const recap = screen.getByRole("region", { name: "Results" });
    expect(within(recap).getByText("Repository-authored clutch moment.")).toBeVisible();
    expect(within(recap).getByText("Semifinal · Clutch · Ascent")).toBeVisible();
    expect(within(recap).queryByText("Routine narration.")).not.toBeInTheDocument();
    const history = screen.getByRole("region", { name: "Recent results" });
    expect(recap.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(history).getByRole("button", { name: "Show saved results" })).toHaveAttribute("aria-expanded", "false");
  });

  it("explains Daily and Free Play from a Daily-first opening", () => {
    render(<GameApp dataset={dataset} now={() => new Date("2026-09-05T23:59:59Z")} />);

    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start today's Daily" })).toHaveClass("action-button");
    expect(screen.getByText("One shared draft each UTC day.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
    expect(screen.getByText(/unlimited drafts/i)).toBeVisible();
    expect(screen.getByText("No saved results yet. Complete a run to build your history.")).toBeVisible();
    expect(screen.queryByText(/Current phase:/)).not.toBeInTheDocument();
  });

  it("treats a prior UTC day's Daily as available", () => {
    const storage = memoryStorage();
    writeRecord(storage, DAILY_RECORD, { completions: [storedRun("daily")], streak: 4 });

    render(<GameApp dataset={dataset} storage={storage} now={() => new Date("2026-09-06T00:00:00Z")} />);

    expect(screen.getByText("Available today")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "View today's result" })).not.toBeInTheDocument();
  });

  it("rolls Daily availability and its start seed forward at UTC midnight", () => {
    vi.useFakeTimers();
    try {
      let current = new Date("2026-09-05T23:59:59.500Z");
      const now = vi.fn(() => current);
      const storage = memoryStorage();
      writeRecord(storage, DAILY_RECORD, { completions: [storedRun("daily")], streak: 4 });
      render(<GameApp dataset={dataset} storage={storage} now={now} />);

      expect(screen.getByText("Completed today")).toBeVisible();
      current = new Date("2026-09-06T00:00:00.000Z");
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByText("Available today")).toBeVisible();

      fireEvent.click(screen.getByRole("button", { name: "Start today's Daily" }));
      const offered = screen.getAllByRole("button").flatMap(button => button.dataset.teamId ? [button.dataset.teamId] : []);
      expect(offered).toEqual(createDraft(dailySeed(current), dataset).offeredTeamIds);
    } finally { vi.useRealTimers(); }
  });

  it("uses the injected UTC date to expose the exact completed Daily result", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    writeRecord(storage, DAILY_RECORD, { completions: [storedRun("daily")], streak: 4 });

    render(<GameApp dataset={dataset} storage={storage} now={() => new Date("2026-09-05T23:59:59Z")} />);

    expect(screen.getByText("Completed today")).toBeVisible();
    expect(screen.getByRole("button", { name: "Replay today's Daily" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "View today's result" }));
    const heading = screen.getByRole("heading", { name: "Daily result" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("region", { name: "Daily result details" })).toHaveTextContent("Rerolls used: 1");
  });

  it("abandons an in-progress run only after explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={dataset} initialState={activeState} />);
    const exit = screen.getByRole("button", { name: "Exit run" });

    await user.click(exit);
    screen.getByRole("dialog", { name: "Exit this run?" });
    const cancel = screen.getByRole("button", { name: "Keep this run" });
    expect(cancel).toHaveFocus();
    await user.click(cancel);
    expect(screen.queryByRole("dialog", { name: "Exit this run?" })).not.toBeInTheDocument();
    expect(exit).toHaveFocus();
    expect(screen.getByRole("button", { name: "Play group stage" })).toBeVisible();

    await user.click(exit);
    fireEvent(screen.getByRole("dialog", { name: "Exit this run?" }), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Exit this run?" })).not.toBeInTheDocument();
    expect(exit).toHaveFocus();
    expect(screen.getByRole("button", { name: "Play group stage" })).toBeVisible();

    await user.click(exit);
    await user.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
  });

  it("shows saved Daily and Free Play results after reload", () => {
    const storage = memoryStorage();
    writeRecord(storage, DAILY_RECORD, { completions: [storedRun("daily")], streak: 1 });
    writeRecord(storage, HISTORY_RECORD, { runs: [storedRun("free")] });
    const first = render(<GameApp dataset={dataset} storage={storage} />);
    expect(screen.getByRole("button", { name: /Show saved results/ })).toBeVisible();
    first.unmount();
    render(<GameApp dataset={dataset} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /Show saved results/ }));
    expect(screen.getAllByRole("button", { name: /View .* result/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "View Daily result from 2026-09-05: Eliminated, Group stage, 1 reroll used" }));
    expect(screen.getByRole("region", { name: "Daily result details" })).toHaveTextContent("Rerolls used: 1");
  });

  it("keeps a large saved history collapsed and bounds its keyboard controls", () => {
    const storage = memoryStorage();
    const completions = Array.from({ length: 730 }, (_, index) => {
      const utcDate = new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10);
      return { ...storedRun("daily"), utcDate, completedAtUtc: utcDate };
    });
    writeRecord(storage, DAILY_RECORD, { completions, streak: 1 });
    writeRecord(storage, HISTORY_RECORD, { runs: Array.from({ length: 20 }, () => storedRun("free")) });
    render(<GameApp dataset={dataset} storage={storage} />);
    expect(screen.queryAllByRole("button", { name: /View .* result/ })).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Show saved results/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Start today's Daily|Replay today's Daily/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Show saved results/ }));
    expect(screen.getAllByRole("button", { name: /View .* result/ }).length).toBeLessThanOrEqual(6);
    fireEvent.click(screen.getByRole("button", { name: "Hide saved results" }));
    expect(screen.queryAllByRole("button", { name: /View .* result/ })).toHaveLength(0);
  });

  it("infers champion from an outcome-less stored final", () => {
    const storage = memoryStorage();
    const champion = terminalState(true).tournament;
    writeRecord(storage, HISTORY_RECORD, { runs: [{
      mode: "free", completedAtUtc: "2026-09-05", stageReached: "final", rerollsUsed: 0,
      roster: champion.userLineup.slots, iglCardId: champion.userLineup.iglCardId,
      series: champion.completedSeries.map(result => ({ stage: result.stage, userWins: result.userWins, opponentWins: result.opponentWins, maps: result.maps.map(map => ({ map: map.map, userScore: map.userScore, opponentScore: map.opponentScore })) })),
    }] });
    render(<GameApp dataset={dataset} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /Show saved results/ }));
    expect(screen.getByRole("button", { name: "View Free Play result from 2026-09-05: Champion, Final, 0 rerolls used" }).parentElement).toHaveTextContent("Champion · final");
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
    expect(within(screen.getByRole("navigation", { name: "Run progress" })).getByRole("status")).toHaveTextContent("Pick 1 of 5 · Choose a team to scout");
    team.unmount();
    const player = render(<GameApp dataset={dataset} initialState={{ phase: "player", mode: "daily", draft: { ...draft, selectedTeamId: "missing" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Selected team is unavailable");
    expect(screen.getByRole("button", { name: "Back to teams" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to teams" }));
    expect(screen.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
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
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
  });
  it("invalidates pending series work before clearing errors or resetting state", () => {
    const calls: string[] = [];
    restartCurrentRun(() => { calls.push("clear error"); }, () => { calls.push("reset state"); }, () => { calls.push("invalidate series"); });
    expect(calls).toEqual(["invalidate series", "clear error", "reset state"]);
  });

  it("keeps a run intact when exit is requested during pending series work", async () => {
    const gateway = gatewayFixture();
    const storage = historyStorage();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} storage={storage} />);
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Play group stage" }));
        fireEvent.click(screen.getByRole("button", { name: "Exit run" }));
      });
      expect(screen.getByRole("dialog", { name: "Exit this run?" })).toBeVisible();
      await act(async () => { await Promise.resolve(); });
      fireEvent.click(screen.getByRole("button", { name: "Keep this run" }));
      expect(screen.getByText("Group stage · Round 1 of 4")).toBeVisible();
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
        fireEvent.click(screen.getByRole("button", { name: "Play group stage" }));
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
    expect(screen.getByLabelText("Choose how to play")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
  });

  it("consumes one free-play seed for one StrictMode click", async () => {
    const user = userEvent.setup();
    const factory = vi.fn(() => "strict-seed");
    render(<StrictMode><GameApp freeSeedFactory={factory} /></StrictMode>);
    await user.click(screen.getByRole("button", { name: "Start Free Play" }));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
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
      expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(storage.getItem(STORAGE_KEYS.history)).toBe("keep-me");
    } finally { errors.mockRestore(); }
  });

  it("locks the actual series control and applies only one group result for two same-tick clicks", async () => {
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    const button = screen.getByRole("button", { name: "Play group stage" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(button).toBeDisabled();
    await act(async () => { await Promise.resolve(); });
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    expect(gateway.playSeries).toHaveBeenCalledTimes(1);
    expect(gateway.generateOpponent).toHaveBeenCalledWith("seed", "group", lineup);
    expect(screen.getByText("Group stage · Round 1 of 4")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to quarterfinal" })).toBeVisible();
    expect(button).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue to quarterfinal" }));
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.generateOpponent).toHaveBeenLastCalledWith("seed", "quarterfinal", lineup);
    expect(screen.getByText("Quarterfinal · Round 2 of 4")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Play quarterfinal" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue to semifinal" }));
    expect(screen.getByText("Semifinal · Round 3 of 4")).toBeVisible();
  });

  it("does not offer a mode switch that can erase an active run", () => {
    const factory = vi.fn(() => "replacement-seed");
    render(<GameApp dataset={dataset} initialState={activeState} freeSeedFactory={factory} />);
    expect(screen.queryByRole("button", { name: "Start Free Play" })).not.toBeInTheDocument();
    expect(screen.getByText("Group stage · Round 1 of 4")).toBeVisible();
    expect(factory).not.toHaveBeenCalled();
  });

  it("catches reducer errors from a series result and restarts the core", async () => {
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => winningSeries("quarterfinal"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
      await userEvent.setup().click(screen.getByRole("button", { name: "Play group stage" }));
      await userEvent.setup().click(screen.getByRole("button", { name: "Continue to quarterfinal" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
      await userEvent.setup().click(screen.getByRole("button", { name: "Restart run" }));
      expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    } finally { errors.mockRestore(); }
  });

  it.each(["generateOpponent", "playSeries"] as const)("resets a real %s error and can start another mode without deleting history", async method => {
    const user = userEvent.setup();
    const storage = historyStorage();
    const gateway = gatewayFixture();
    gateway[method].mockImplementation(() => { throw new Error("simulation failed"); });
    render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} storage={storage} />);
    if (method === "generateOpponent") expect(screen.getByRole("alert")).toHaveTextContent("We couldn't build a valid opponent");
    else { await user.click(screen.getByRole("button", { name: "Play group stage" })); expect(screen.getByRole("alert")).toHaveTextContent("The group stage couldn't be simulated"); }
    await user.click(screen.getByRole("button", { name: "Exit run" }));
    await user.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEYS.history)).toBe("keep-me");
    await user.click(screen.getByRole("button", { name: "Start today's Daily" }));
    expect(screen.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
  });

  it("resets an active run immediately when the dataset identity changes", () => {
    const gateway = gatewayFixture();
    const view = render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    expect(screen.getByRole("button", { name: "Play group stage" })).toBeVisible();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    view.rerender(<GameApp dataset={parseDataset(minimalDataset)} initialState={activeState} gateway={gateway} />);
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Play group stage" })).not.toBeInTheDocument();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    view.rerender(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
  });
});
