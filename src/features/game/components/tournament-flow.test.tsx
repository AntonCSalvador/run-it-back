import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "../domain";
import type { GeneratedOpponent } from "../opponents";
import { parseDataset } from "../schema";
import { GameApp } from "./game-app";
import { activeState, dataset, gatewayFixture, lineup, runSeed, series, terminalState } from "./tournament-test-fixtures";

const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks();
  for (const [key, descriptor] of [["share", originalShare], ["clipboard", originalClipboard]] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});
const play = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play series" })); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
function assertMaps() {
  expect(within(screen.getByRole("list", { name: "Map results" })).getAllByRole("listitem").map(row => row.textContent)).toEqual([
    "Ascent 13–7", "Bind 7–13", "Haven 13–7",
  ]);
}
function draftNewRun() {
  const usedPlayers = new Set<string>();
  for (const role of ROLES) {
    const offers = within(screen.getByRole("region", { name: "Choose a team" })).getAllByRole("button");
    const team = offers.find(button => dataset.cards.some(card => card.teamId === button.dataset.teamId && card.eligibleRoles.includes(role) && !usedPlayers.has(card.playerId)))!;
    const card = dataset.cards.find(card => card.teamId === team.dataset.teamId && card.eligibleRoles.includes(role) && !usedPlayers.has(card.playerId))!;
    fireEvent.click(team);
    fireEvent.click(screen.getByRole("button", { name: `${card.displayHandle} ${card.year}` }));
    fireEvent.click(within(screen.getByRole("group", { name: "Choose an open role" })).getByRole("button", { name: role }));
    usedPlayers.add(card.playerId);
  }
  fireEvent.click(screen.getAllByRole("radio")[0]);
  fireEvent.click(screen.getByRole("button", { name: "Start tournament" }));
}

describe("tournament presentation", () => {
  it("shows exactly five official opponent roles, handles, years and one IGL before play", () => {
    const gateway = gatewayFixture();
    const { container } = render(<GameApp dataset={dataset} initialState={activeState()} gateway={gateway} />);
    const opponent = gateway.generateOpponent.mock.results[0].value as GeneratedOpponent;
    const roster = within(screen.getByRole("region", { name: "Opponent roster" }));
    const rows = roster.getAllByRole("article");
    expect(rows).toHaveLength(5);
    expect(rows.map(row => row.querySelector("strong")?.textContent)).toEqual(["smokes", "duelist", "initiator", "sentinel", "flex"]);
    opponent.lineup.slots.forEach(slot => {
      const card = dataset.cards.find(card => card.id === slot.cardId)!;
      const row = rows[ROLES.indexOf(slot.role)];
      expect(row).toHaveTextContent(`${slot.role} ${card.displayHandle} ${card.year}${card.id === opponent.lineup.iglCardId ? " · IGL" : ""}`);
    });
    expect(roster.getAllByText(/IGL/)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Play series" })).toHaveLength(1);
    expect(container).not.toHaveTextContent(/strength|probability|\broll\b|traits|formula/iu);
  });

  it("keeps the same generated opponent across rerenders and locks two same-task Play clicks", async () => {
    const gateway = gatewayFixture();
    const initial = activeState();
    const view = render(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    const opponent = gateway.generateOpponent.mock.results[0].value;
    view.rerender(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button", { name: "Play series" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(button).toBeDisabled();
    await act(async () => { await Promise.resolve(); });
    expect(gateway.playSeries).toHaveBeenCalledExactlyOnceWith(runSeed, "group", lineup, opponent);
    expect(gateway.playSeries.mock.calls[0][3]).toBe(opponent);
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Series score")).toHaveTextContent("2–1");
  });

  it.each([["group", "Group stage", "Quarterfinal"], ["quarterfinal", "Quarterfinal", "Semifinal"]] as const)("pauses %s on every map score without highlights; Continue advances exactly once", async (stage, label, nextLabel) => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState(stage)} gateway={gateway} />);
    await play();
    expect(screen.getByRole("heading", { name: label })).toBeVisible();
    expect(screen.getByLabelText("Series score")).toHaveTextContent("2–1");
    assertMaps();
    expect(screen.queryByRole("region", { name: "SIMULATED HIGHLIGHTS" })).not.toBeInTheDocument();
    expect(gateway.createHighlights).not.toHaveBeenCalled();
    tick(60000);
    expect(screen.getByRole("heading", { name: label })).toBeVisible();
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeEnabled();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(screen.getByRole("heading", { name: nextLabel })).toBeVisible();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.playSeries).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Series score")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play series" })).toBeEnabled();
  });

  it.each(["semifinal", "final"] as const)("creates %s highlights once from the exact result and opponent, retaining completion on rerender", async stage => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    const initial = activeState(stage);
    const view = render(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    const opponent = gateway.generateOpponent.mock.results[0].value;
    await play();
    const result = gateway.playSeries.mock.results[0].value;
    expect(gateway.createHighlights).toHaveBeenCalledExactlyOnceWith(runSeed, result, lineup, opponent.lineup);
    expect(gateway.createHighlights.mock.calls[0][1]).toBe(result);
    expect(gateway.createHighlights.mock.calls[0][3]).toBe(opponent.lineup);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    next();
    expect(screen.getByText("Current phase: tournament")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    tick(800);
    expect(screen.getByText(`${stage} moment 2`)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    view.rerender(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    tick(799);
    expect(screen.queryByText(`${stage} moment 3`)).not.toBeInTheDocument();
    tick(1);
    expect(screen.getByText(`${stage} moment 3`)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(gateway.createHighlights).toHaveBeenCalledTimes(1);
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    if (stage === "final") {
      expect(screen.getByText("BO5")).toBeVisible();
      expect(screen.getByLabelText("Series score")).toHaveTextContent("3–2");
      expect(within(screen.getByRole("list", { name: "Map results" })).getAllByRole("listitem").map(row => row.textContent)).toEqual([
        "Ascent 13–7", "Bind 7–13", "Haven 13–7", "Split 7–13", "Icebox 13–7",
      ]);
    }
  });

  it("Skip completes a semifinal immediately and the final starts with a fresh locked queue", async () => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);
    await play();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("semifinal moment 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    next();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("heading", { name: "Final" })).toBeVisible();
    await play();
    expect(screen.getByText("final moment 1")).toBeVisible();
    expect(screen.queryByText("final moment 2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.createHighlights).toHaveBeenCalledTimes(2);
  });

  it.each(["mode", "run", "dataset", "unmount"] as const)("cleans pending presentation on %s reset", async reset => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    const initial = activeState("semifinal");
    const view = render(<GameApp dataset={dataset} initialState={initial} gateway={gateway} freeSeedFactory={() => "new-seed"} />);
    await play();
    tick(700);
    if (reset === "mode") fireEvent.click(screen.getByRole("button", { name: "Free Play" }));
    if (reset === "run") fireEvent.click(screen.getByRole("button", { name: "Reset current run" }));
    if (reset === "dataset") view.rerender(<GameApp dataset={parseDataset(dataset)} initialState={initial} gateway={gateway} />);
    if (reset === "unmount") view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    tick(10000);
    expect(screen.queryByRole("region", { name: "SIMULATED HIGHLIGHTS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(gateway.createHighlights).toHaveBeenCalledTimes(1);
    if (reset === "mode") {
      draftNewRun();
      expect(screen.getByRole("heading", { name: "Group stage" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Play series" })).toBeEnabled();
      expect(screen.queryByLabelText("Series score")).not.toBeInTheDocument();
      expect(screen.queryByText("semifinal moment 1")).not.toBeInTheDocument();
    }
  });
});

describe("terminal GameApp integration", () => {
  it("keeps the original Daily date when a run starts before midnight and finishes the next UTC day", async () => {
    vi.useFakeTimers();
    let currentDate = new Date("2026-09-04T23:59:59Z");
    vi.setSystemTime(currentDate);
    const now = vi.fn(() => currentDate);
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation((_seed, stage) => series(stage, false));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<GameApp dataset={dataset} gateway={gateway} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    draftNewRun();
    expect(gateway.generateOpponent.mock.calls[0][0]).toBe("run-it-back:daily:2026-09-04:v1");
    currentDate = new Date("2026-09-05T00:00:01Z");
    vi.setSystemTime(currentDate);
    await play();
    next();
    expect(screen.getByRole("heading", { name: "Eliminated" })).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("Run It Back — Daily 2026-09-04\nStage: group\nSeries: L 1-2\nRerolls: 0\nRun It Back");
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("recovers an invalid Daily seed through the error boundary without substituting today's date", () => {
    const initial = terminalState(false);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<GameApp dataset={dataset} initialState={{ ...initial, tournament: { ...initial.tournament, seed: "invalid-daily-seed" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong with this run.");
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart run" }));
    expect(screen.getByText("Current phase: mode")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(errors).toHaveBeenCalled();
  });

  it.each([false, true])("projects a valid privacy-safe Daily share only after terminal Continue (champion %s)", async champion => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
    const gateway = gatewayFixture();
    if (!champion) gateway.playSeries.mockImplementation((_seed, stage) => series(stage, false));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = render(<GameApp dataset={dataset} initialState={activeState()} gateway={gateway} />);
    for (const stage of champion ? ["group", "quarterfinal", "semifinal", "final"] : ["group"]) {
      await play();
      expect(screen.getByText("Current phase: tournament")).toBeVisible();
      expect(screen.queryByRole("region", { name: "Results" })).not.toBeInTheDocument();
      if (stage === "semifinal" || stage === "final") fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      next();
    }
    expect(screen.getByText("Current phase: results")).toBeVisible();
    expect(screen.getByRole("heading", { name: champion ? "Champion" : "Eliminated" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });
    const expected = `Run It Back — Daily 2026-09-05\nStage: ${champion ? "final" : "group"}\nSeries: ${champion ? "W 2-1 · W 2-1 · W 2-1 · W 3-2" : "L 1-2"}\nRerolls: 1\nRun It Back`;
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
    expect(container).not.toHaveTextContent(/strength|probability|\broll\b|traits|formula/iu);
    expect(expected).not.toMatch(/aspas|player-|seed|0\.6|0\.2/);
    expect(gateway.playSeries).toHaveBeenCalledTimes(champion ? 4 : 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["Run again", "Daily", "Free Play"])("%s on results starts a real fresh draft", control => {
    const freeSeedFactory = vi.fn(() => "new-seed");
    render(<GameApp dataset={dataset} initialState={terminalState(false)} freeSeedFactory={freeSeedFactory} now={() => new Date("2026-09-05T12:00:00Z")} />);
    fireEvent.click(within(screen.getByRole("region", { name: "Results" })).getByRole("button", { name: control }));
    expect(screen.getByText("Current phase: team")).toBeVisible();
    expect(screen.getByRole("region", { name: "Choose a team" })).toBeVisible();
    expect(screen.getByRole("button", { name: control === "Free Play" ? "Free Play" : "Daily" })).toHaveAttribute("aria-pressed", "true");
    expect(freeSeedFactory).toHaveBeenCalledTimes(control === "Free Play" ? 1 : 0);
    expect(screen.queryByRole("region", { name: "Results" })).not.toBeInTheDocument();
  });

  it.each([false, true])("shares a valid Free Play terminal projection with only public roster information (champion %s)", async champion => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<GameApp dataset={dataset} initialState={{ ...terminalState(champion), mode: "free-play" }} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `Run It Back — Free Play\nStage: ${champion ? "final" : "group"}\nSeries: ${champion ? "W 2-1 · W 2-1 · W 2-1 · W 3-2" : "L 1-2"}\nRerolls: 1\naspas (smokes) · player-2 (duelist) · player-3 (initiator) · player-4 (sentinel) · player-5 (flex)\nRun It Back`);
    expect(writeText.mock.calls[0][0]).not.toMatch(/seed|strength|probability|\broll\b|traits|formula|firepower|0\.6/);
  });

  it("Run again after a played loss clears presentation through the next actual draft", async () => {
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation((_seed, stage) => series(stage, false));
    render(<GameApp dataset={dataset} initialState={activeState()} gateway={gateway} now={() => new Date("2026-09-05T12:00:00Z")} />);
    await play();
    next();
    expect(screen.getByRole("heading", { name: "Eliminated" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    draftNewRun();
    expect(screen.getByRole("heading", { name: "Group stage" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Play series" })).toBeEnabled();
    expect(screen.queryByLabelText("Series score")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    await play();
    expect(gateway.playSeries).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
