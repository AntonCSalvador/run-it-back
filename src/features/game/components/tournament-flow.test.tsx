import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "../domain";
import type { GeneratedOpponent } from "../opponents";
import { parseDataset } from "../schema";
import { GameApp, significantHighlights } from "./game-app";
import { TournamentView } from "./tournament-view";
import { activeState, dataset, gatewayFixture, lineup, runSeed, series, terminalState } from "./tournament-test-fixtures";

const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [key, descriptor] of [["share", originalShare], ["clipboard", originalClipboard]] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});
function reducedMotionPreference(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener as (event: MediaQueryListEvent) => void));
  const removeEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener as (event: MediaQueryListEvent) => void));
  const query = {
    media: "(prefers-reduced-motion: reduce)", onchange: null,
    get matches() { return matches; },
    addEventListener, removeEventListener,
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return { query, addEventListener, removeEventListener, set(value: boolean) {
    matches = value;
    const event = { matches: value, media: query.media } as MediaQueryListEvent;
    listeners.forEach(listener => listener(event));
  } };
}
const currentPlay = () => screen.getByRole("button", { name: /^Play (?:group stage|quarterfinal|semifinal|final)$/ });
const currentContinue = () => screen.getByRole("button", { name: /^Continue to / });
const play = () => act(async () => { fireEvent.click(currentPlay()); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const next = () => fireEvent.click(currentContinue());
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function assertMaps() {
  expect(within(screen.getByRole("list", { name: "Map results" })).getAllByRole("listitem").map(row => row.textContent)).toEqual([
    "Ascent 13–7", "Bind 7–13", "Haven 13–7",
  ]);
}
function draftNewRun() {
  const usedPlayers = new Set<string>();
  for (const role of ROLES) {
    const offers = within(screen.getByRole("region", { name: "Choose a team to scout" })).getAllByRole("button");
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
  it("retains only unique clutch or decisive repository moments for the recap", () => {
    const base = { actorCardId: lineup.iglCardId, side: "user" as const, text: "Repository narration", map: "Ascent" as const, mapIndex: 0 };
    const important = [
      { ...base, id: "clutch", kind: "clutch" as const, emphasis: "clutch" as const },
      { ...base, id: "decisive", kind: "ace" as const, emphasis: "decisive" as const },
      { ...base, id: "normal", kind: "ace" as const, emphasis: "normal" as const },
      { ...base, id: "clutch", kind: "clutch" as const, emphasis: "clutch" as const },
    ];

    expect(significantHighlights(important).map(item => item.id)).toEqual(["clutch", "decisive"]);
    expect(significantHighlights(important).map(item => item.text)).toEqual(["Repository narration", "Repository narration"]);
  });

  it("shows the complete four-round rail and current matchup without spoiling future results", () => {
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    const rail = screen.getByRole("navigation", { name: "Tournament stages" });
    const stages = within(rail).getAllByRole("listitem");
    expect(stages.map(item => item.textContent)).toEqual([
      "Group stage · Won 2–1",
      "Quarterfinal · Won 2–1",
      "Semifinal · Current",
      "Final · Upcoming",
    ]);
    expect(stages[2]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Semifinal · Round 3 of 4")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Play semifinal" })).toBeEnabled();
  });

  it("presents a revealed loss as elimination and marks unreachable rounds not reached", async () => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation((_seed, stage) => series(stage, false));
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play semifinal" })); });
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));

    const stages = within(screen.getByRole("navigation", { name: "Tournament stages" })).getAllByRole("listitem");
    expect(stages.map(item => item.textContent)).toEqual([
      "Group stage · Won 2–1",
      "Quarterfinal · Won 2–1",
      "Semifinal · Lost 1–2",
      "Final · Not reached",
    ]);
    expect(screen.getByRole("heading", { name: "Series result: Loss, 1–2" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Continue to results" })).toBeEnabled();
  });

  it("presents a revealed win in the current rail item and keeps the next round reachable", async () => {
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState()} gateway={gateway} />);

    await play();

    const stages = within(screen.getByRole("navigation", { name: "Tournament stages" })).getAllByRole("listitem");
    expect(stages.map(item => item.textContent)).toEqual([
      "Group stage · Won 2–1",
      "Quarterfinal · Upcoming",
      "Semifinal · Upcoming",
      "Final · Upcoming",
    ]);
    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Continue to quarterfinal" })).toBeEnabled();
  });

  it("keeps every decisive tournament action before both detailed roster sheets in reading order", () => {
    const gateway = gatewayFixture();
    const tournament = activeState().tournament;
    const opponent = gateway.generateOpponent(runSeed, "group", lineup);
    const base = { tournament, opponent, cards: dataset.cards, result: null, revealComplete: false,
      resolving: false, error: null, onPlay: vi.fn(), onRetryOpponent: vi.fn(), onRetrySeries: vi.fn(), onContinue: vi.fn() };
    const view = render(<TournamentView {...base} />);
    const assertBeforeRosters = (name: string) => {
      const action = screen.getByRole("button", { name });
      for (const rosterName of ["Your roster", "Opponent roster"]) {
        const roster = screen.getByRole("region", { name: rosterName });
        expect(action.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    };

    assertBeforeRosters("Play group stage");
    view.rerender(<TournamentView {...base} resolving />);
    assertBeforeRosters("Playing group stage…");
    view.rerender(<TournamentView {...base} error="The group stage couldn't be simulated." />);
    assertBeforeRosters("Retry group stage");
    view.rerender(<TournamentView {...base} result={series("group")} revealComplete />);
    assertBeforeRosters("Continue to quarterfinal");
  });

  it("keeps semifinal highlight decisions before roster details in mobile reading order", async () => {
    vi.useFakeTimers();
    reducedMotionPreference(false);
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    await play();

    const skip = screen.getByRole("button", { name: "Skip to result" });
    expect(screen.queryByRole("button", { name: "Play semifinal" })).not.toBeInTheDocument();
    for (const rosterName of ["Your roster", "Opponent roster"]) {
      const roster = screen.getByRole("region", { name: rosterName });
      expect(skip.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("keeps round context and retries opponent generation without changing the run", () => {
    const gateway = gatewayFixture();
    const generated = gateway.generateOpponent(activeState().tournament.seed, "group", lineup);
    gateway.generateOpponent.mockReset().mockImplementationOnce(() => { throw new Error("fixture failure"); }).mockReturnValue(generated);
    render(<GameApp dataset={dataset} initialState={activeState()} gateway={gateway} />);

    expect(screen.getByText("Group stage · Round 1 of 4")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your roster vs. Opponent pending" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Your roster" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Opponent roster" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't build a valid opponent for this round. Your roster is safe.");

    fireEvent.click(screen.getByRole("button", { name: "Retry opponent" }));
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.generateOpponent).toHaveBeenLastCalledWith(runSeed, "group", lineup);
    expect(screen.getByRole("region", { name: "Opponent roster" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Play group stage" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toHaveFocus();
  });

  it("retries a failed series with the exact same seed, stage, lineup, and opponent", async () => {
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementationOnce(() => { throw new Error("fixture failure"); }).mockImplementation((_seed, stage) => series(stage));
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);
    const opponent = gateway.generateOpponent.mock.results[0].value;

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play semifinal" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("The semifinal couldn't be simulated. Your draft and round are unchanged.");
    expect(screen.getByRole("button", { name: "Retry semifinal" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry semifinal" })).toHaveFocus();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry semifinal" })); });
    expect(gateway.playSeries).toHaveBeenCalledTimes(2);
    for (const call of gateway.playSeries.mock.calls) {
      expect(call).toEqual([runSeed, "semifinal", lineup, opponent]);
      expect(call[3]).toBe(opponent);
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("semifinal moment 1")).toBeVisible();
  });

  it.each(["semifinal", "final"] as const)("withholds the %s score until narration completes or is skipped", async stage => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState(stage)} gateway={gateway} />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: `Play ${stage}` })); });
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Map results" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    expect(screen.getByRole("heading", { name: `Series result: Win, ${stage === "final" ? "3–2" : "2–1"}` })).toBeVisible();
    expect(screen.getByRole("button", { name: stage === "final" ? "Continue to results" : "Continue to final" })).toBeEnabled();
  });

  it.each(["semifinal", "final"] as const)("reveals the %s result immediately when reduced motion is preferred", async stage => {
    vi.useFakeTimers();
    reducedMotionPreference(true);
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState(stage)} gateway={gateway} />);

    await play();

    expect(screen.getByText(`${stage} moment 3`)).toBeVisible();
    expect(screen.getByRole("heading", { name: `Series result: Win, ${stage === "final" ? "3–2" : "2–1"}` })).toHaveFocus();
    expect(currentContinue()).toBeEnabled();
  });

  it("retains paced semifinal narration when reduced motion is not preferred", async () => {
    vi.useFakeTimers();
    reducedMotionPreference(false);
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    await play();

    expect(screen.getByText("semifinal moment 1")).toBeVisible();
    expect(screen.queryByText("semifinal moment 2")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();
  });

  it("responds to reduced-motion changes during narration and removes its media listener", async () => {
    vi.useFakeTimers();
    const preference = reducedMotionPreference(false);
    const gateway = gatewayFixture();
    const view = render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);
    await play();
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();

    act(() => preference.set(true));
    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toBeVisible();
    expect(preference.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    const listener = preference.addEventListener.mock.calls[0][1];
    view.unmount();
    expect(preference.removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("invalidates a deferred series when the user confirms exit", async () => {
    const pending = deferred<ReturnType<typeof series>>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    fireEvent.click(screen.getByRole("button", { name: "Play semifinal" }));
    expect(screen.getByRole("button", { name: "Playing semifinal…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Exit run" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
    pending.resolve(series("semifinal"));
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();
    expect(gateway.createHighlights).not.toHaveBeenCalled();
  });

  it("ignores a deferred series failure after the user confirms exit", async () => {
    const pending = deferred<ReturnType<typeof series>>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    fireEvent.click(screen.getByRole("button", { name: "Play semifinal" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit run" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
    pending.reject(new Error("late failure"));
    await act(async () => { await pending.promise.catch(() => undefined); await Promise.resolve(); });

    fireEvent.click(screen.getByRole("button", { name: "Start Free Play" }));
    draftNewRun();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play group stage" })).toBeEnabled();
  });

  it("keeps the round busy until a deferred series resolves", async () => {
    const pending = deferred<ReturnType<typeof series>>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);
    render(<GameApp dataset={dataset} initialState={activeState()} gateway={gateway} />);

    fireEvent.click(screen.getByRole("button", { name: "Play group stage" }));
    expect(screen.getByRole("button", { name: "Playing group stage…" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();
    pending.resolve(series("group"));
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to quarterfinal" })).toBeEnabled();
  });

  it("announces simulation start and completion once through one stable polite tournament status", async () => {
    const pending = deferred<ReturnType<typeof series>>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);
    render(<StrictMode><GameApp dataset={dataset} initialState={activeState()} gateway={gateway} /></StrictMode>);
    const tournament = screen.getByRole("region", { name: "Tournament" });
    const update = screen.getByRole("status", { name: "Tournament update" });
    expect(update).toHaveAttribute("aria-live", "polite");
    expect(update).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Play group stage" }));
    expect(tournament).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Playing group stage…" })).toBeDisabled();
    expect(update).toHaveTextContent("Simulating group stage.");
    expect(screen.getAllByText("Simulating group stage.")).toHaveLength(1);

    pending.resolve(series("group"));
    await act(async () => { await pending.promise; await Promise.resolve(); });
    expect(tournament).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("status", { name: "Tournament update" })).toBe(update);
    expect(update).toHaveTextContent("Group stage complete. You won 2–1.");
    expect(screen.getAllByRole("status", { name: "Tournament update" })).toHaveLength(1);
  });

  it("clears tournament busy state when an asynchronous series fails", async () => {
    const pending = deferred<ReturnType<typeof series>>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);
    const tournament = screen.getByRole("region", { name: "Tournament" });

    fireEvent.click(screen.getByRole("button", { name: "Play semifinal" }));
    expect(tournament).toHaveAttribute("aria-busy", "true");
    pending.reject(new Error("fixture failure"));
    await act(async () => { await pending.promise.catch(() => undefined); await Promise.resolve(); });

    expect(tournament).toHaveAttribute("aria-busy", "false");
    expect(within(tournament).getByRole("alert")).toHaveTextContent("The semifinal couldn't be simulated.");
    expect(screen.getByRole("status", { name: "Tournament update" })).toBeEmptyDOMElement();
  });

  it("preserves initial focus, then focuses and announces the series result after Play", async () => {
    const user = userEvent.setup();
    const gateway = gatewayFixture();
    render(<><button type="button" autoFocus>Outside control</button><GameApp dataset={dataset} initialState={activeState()} gateway={gateway} /></>);
    expect(screen.getByRole("button", { name: "Outside control" })).toHaveFocus();
    const announcement = screen.getByRole("status", { name: "Tournament update" });
    expect(announcement).toBeEmptyDOMElement();
    const playButton = currentPlay();
    await user.click(playButton);
    expect(playButton).not.toBeInTheDocument();
    const resultHeading = screen.getByRole("heading", { name: "Series result: Win, 2–1" });
    expect(resultHeading).toHaveAttribute("tabindex", "-1");
    expect(resultHeading).toHaveFocus();
    expect(screen.getByRole("status", { name: "Tournament update" })).toBe(announcement);
    expect(announcement).toHaveAttribute("aria-live", "polite");
    expect(announcement).toHaveTextContent("Group stage complete. You won 2–1.");
    for (const text of ["Ascent 13–7", "Bind 7–13", "Haven 13–7"]) expect(screen.getByRole("list", { name: "Map results" })).toHaveTextContent(text);
    expect(screen.getAllByRole("button", { name: "Continue to quarterfinal" })).toHaveLength(1);
  });

  it("moves natural focus from Start tournament to the matchup heading", async () => {
    const user = userEvent.setup();
    const gateway = gatewayFixture();
    render(<StrictMode><GameApp dataset={dataset} initialState={{ phase: "lineup", mode: "daily", draft: activeState().draft }} gateway={gateway} /></StrictMode>);
    const start = screen.getByRole("button", { name: "Start tournament" });

    await user.click(start);

    expect(start).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toHaveFocus();
  });

  it("moves natural focus to Retry opponent when tournament entry cannot generate an opponent", async () => {
    const user = userEvent.setup();
    const gateway = gatewayFixture();
    gateway.generateOpponent.mockImplementation(() => { throw new Error("fixture failure"); });
    render(<GameApp dataset={dataset} initialState={{ phase: "lineup", mode: "daily", draft: activeState().draft }} gateway={gateway} />);

    await user.click(screen.getByRole("button", { name: "Start tournament" }));

    expect(screen.getByRole("button", { name: "Retry opponent" })).toHaveFocus();
  });

  it("moves natural focus from Play to narration, then from Skip to the revealed result", async () => {
    const user = userEvent.setup();
    const gateway = gatewayFixture();
    render(<StrictMode><GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "Play semifinal" }));
    const highlightsHeading = screen.getByRole("heading", { name: "SIMULATED HIGHLIGHTS" });
    expect(highlightsHeading).toHaveAttribute("tabindex", "-1");
    expect(highlightsHeading).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Skip to result" }));
    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toHaveFocus();
  });

  it("moves natural focus to the result when timed narration completes", async () => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState("semifinal")} gateway={gateway} />);

    await play();
    expect(screen.getByRole("heading", { name: "SIMULATED HIGHLIGHTS" })).toHaveFocus();
    tick(1600);
    tick(1600);

    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toHaveFocus();
  });

  it("moves focus from Continue to the next stage heading without repeat focus on rerender", async () => {
    const user = userEvent.setup();
    const gateway = gatewayFixture();
    const initial = activeState();
    const view = render(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    await play();
    const button = currentContinue();
    await user.click(button);
    expect(button).not.toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: "Your roster vs. Challenger roster" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveFocus();
    const playButton = currentPlay();
    await user.tab();
    expect(playButton).toHaveFocus();
    view.rerender(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    expect(playButton).toHaveFocus();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
  });

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
    expect(screen.getAllByRole("button", { name: "Play group stage" })).toHaveLength(1);
    expect(container).not.toHaveTextContent(/strength|probability|\broll\b|traits|formula/iu);
  });

  it("keeps the same generated opponent across rerenders and locks two same-task Play clicks", async () => {
    const gateway = gatewayFixture();
    const initial = activeState();
    const view = render(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    const opponent = gateway.generateOpponent.mock.results[0].value;
    view.rerender(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    const button = currentPlay();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(button).toBeDisabled();
    await act(async () => { await Promise.resolve(); });
    expect(gateway.playSeries).toHaveBeenCalledExactlyOnceWith(runSeed, "group", lineup, opponent);
    expect(gateway.playSeries.mock.calls[0][3]).toBe(opponent);
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toBeVisible();
  });

  it.each([["group", "Group stage", "Quarterfinal"], ["quarterfinal", "Quarterfinal", "Semifinal"]] as const)("pauses %s on every map score without highlights; Continue advances exactly once", async (stage, label, nextLabel) => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState(stage)} gateway={gateway} />);
    await play();
    expect(screen.getByText(new RegExp(`^${label} · Round`))).toBeVisible();
    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" })).toBeVisible();
    assertMaps();
    expect(screen.queryByRole("region", { name: "SIMULATED HIGHLIGHTS" })).not.toBeInTheDocument();
    expect(gateway.createHighlights).not.toHaveBeenCalled();
    tick(60000);
    expect(screen.getByText(new RegExp(`^${label} · Round`))).toBeVisible();
    const button = currentContinue();
    expect(button).toBeEnabled();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(screen.getByText(new RegExp(`^${nextLabel} · Round`))).toBeVisible();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.playSeries).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();
    expect(currentPlay()).toBeEnabled();
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
    expect(screen.queryByRole("button", { name: /^Continue to / })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Run progress" })).toHaveTextContent("Tournament");
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    tick(800);
    expect(screen.getByText(`${stage} moment 2`)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Continue to / })).not.toBeInTheDocument();
    view.rerender(<GameApp dataset={dataset} initialState={initial} gateway={gateway} />);
    tick(799);
    expect(screen.queryByText(`${stage} moment 3`)).not.toBeInTheDocument();
    tick(1);
    expect(screen.getByText(`${stage} moment 3`)).toBeVisible();
    expect(currentContinue()).toBeEnabled();
    expect(gateway.createHighlights).toHaveBeenCalledTimes(1);
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(1);
    if (stage === "final") {
      expect(screen.getByText("Best of 5")).toBeVisible();
      expect(screen.getByRole("heading", { name: "Series result: Win, 3–2" })).toBeVisible();
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
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    expect(screen.getByText("semifinal moment 3")).toBeVisible();
    expect(currentContinue()).toBeEnabled();
    next();
    tick(200); // Let the finite win accent clean up after the focus transition.
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByText("Final · Round 4 of 4")).toBeVisible();
    await play();
    expect(screen.getByText("final moment 1")).toBeVisible();
    expect(screen.queryByText("final moment 2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue to / })).not.toBeInTheDocument();
    expect(gateway.generateOpponent).toHaveBeenCalledTimes(2);
    expect(gateway.createHighlights).toHaveBeenCalledTimes(2);
  });

  it.each(["exit", "dataset", "unmount"] as const)("cleans pending presentation on %s reset", async reset => {
    vi.useFakeTimers();
    const gateway = gatewayFixture();
    const initial = activeState("semifinal");
    const view = render(<GameApp dataset={dataset} initialState={initial} gateway={gateway} freeSeedFactory={() => "new-seed"} />);
    await play();
    tick(700);
    if (reset === "exit") {
      fireEvent.click(screen.getByRole("button", { name: "Exit run" }));
      // Let jsdom finish its zero-delay selection update from focusing Cancel.
      tick(0);
      fireEvent.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
      expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    }
    if (reset === "dataset") view.rerender(<GameApp dataset={parseDataset(dataset)} initialState={initial} gateway={gateway} />);
    if (reset === "unmount") view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(vi.getTimerCount()).toBe(reset === "unmount" ? 0 : 1);
    tick(10000);
    expect(screen.queryByRole("region", { name: "SIMULATED HIGHLIGHTS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue to / })).not.toBeInTheDocument();
    expect(gateway.createHighlights).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole("button", { name: "Start today's Daily" }));
    draftNewRun();
    expect(gateway.generateOpponent.mock.calls[0][0]).toBe("run-it-back:daily:2026-09-04:v1");
    currentDate = new Date("2026-09-05T00:00:01Z");
    vi.setSystemTime(currentDate);
    await play();
    next();
    expect(screen.getByRole("heading", { name: "Eliminated" })).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("Run It Back — Daily 2026-09-04\nStage: group\nSeries: L 1-2\nRerolls: 0\nRun It Back");
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("recovers an invalid Daily seed through the error boundary without substituting today's date", () => {
    const initial = terminalState(false);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<GameApp dataset={dataset} initialState={{ ...initial, tournament: { ...initial.tournament, seed: "invalid-daily-seed" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong with this run.");
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart run" }));
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
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
      expect(screen.getByRole("navigation", { name: "Run progress" })).toHaveTextContent("Tournament");
      expect(screen.queryByRole("region", { name: "Results" })).not.toBeInTheDocument();
      if (stage === "semifinal" || stage === "final") fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
      next();
    }
    expect(screen.getByRole("navigation", { name: "Run progress" })).toHaveTextContent("Run complete");
    expect(screen.getByRole("heading", { name: champion ? "Champion" : "Eliminated" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });
    const expected = `Run It Back — Daily 2026-09-05\nStage: ${champion ? "final" : "group"}\nSeries: ${champion ? "W 2-1 · W 2-1 · W 2-1 · W 3-2" : "L 1-2"}\nRerolls: 1\nRun It Back`;
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
    expect(container).not.toHaveTextContent(/strength|probability|\broll\b|traits|formula/iu);
    expect(expected).not.toMatch(/aspas|player-|seed|0\.6|0\.2/);
    expect(gateway.playSeries).toHaveBeenCalledTimes(champion ? 4 : 1);
    tick(200); // Let the finite win/champion accent clean up after focus changes.
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["Run again", "Daily", "Free Play"])("%s on results starts a real fresh draft", control => {
    const freeSeedFactory = vi.fn(() => "new-seed");
    render(<GameApp dataset={dataset} initialState={terminalState(false)} freeSeedFactory={freeSeedFactory} now={() => new Date("2026-09-05T12:00:00Z")} />);
    fireEvent.click(within(screen.getByRole("region", { name: "Results" })).getByRole("button", { name: control }));
    expect(screen.getByRole("navigation", { name: "Run progress" })).toHaveTextContent("Pick 1 of 5 · Choose a team to scout");
    expect(screen.getByRole("region", { name: "Choose a team to scout" })).toBeVisible();
    expect(screen.getByLabelText("Current mode")).toHaveTextContent(control === "Free Play" ? "Free Play" : "Daily");
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
    expect(screen.getByText("Group stage · Round 1 of 4")).toBeVisible();
    expect(screen.getByRole("button", { name: "Play group stage" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: /^Series result:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue to / })).not.toBeInTheDocument();
    await play();
    expect(gateway.playSeries).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Continue to results" })).toBeEnabled();
  });
});
