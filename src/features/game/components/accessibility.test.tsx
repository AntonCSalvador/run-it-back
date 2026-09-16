import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { AppHeader } from "./app-header";
import { TeamOffer } from "./team-offer";
import type { TeamAppearance } from "../domain";
import { useFireAccent } from "./use-fire-accent";
import { GameApp } from "./game-app";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "../schema";
import { activeState } from "./tournament-test-fixtures";
import { dataset as fixtureDataset, lineup, series, terminalState } from "./tournament-test-fixtures";
import { TournamentView } from "./tournament-view";
import { ResultsView } from "./results-view";
import { projectTerminalResult } from "../result-projection";
import { RosterBar } from "./roster-bar";
import { PlayerPicker } from "./player-picker";
import { IglPicker } from "./igl-picker";
import { RunProgress } from "./run-progress";

afterEach(() => window.localStorage.clear());

function AccentProbe() { const fire = useFireAccent(); return <button className={fire.fireClass} onClick={fire.trigger}>ignite</button>; }
function animationEnd(target: HTMLElement, animationName: string): void {
  // jsdom lacks AnimationEvent; React therefore registers the WebKit fallback.
  // Emit both spellings so this helper also works when jsdom gains native support.
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "animationName", { value: animationName });
    fireEvent(target, event);
  }
}

const teams: TeamAppearance[] = [
  { id: "one", name: "One", shortName: "ONE", year: 2024, logo: null, sourceIds: [] },
  { id: "two", name: "Two", shortName: "TWO", year: 2024, logo: null, sourceIds: [] },
  { id: "three", name: "Three", shortName: "THREE", year: 2024, logo: null, sourceIds: [] },
];

describe("broadcast accessibility", () => {
  it("starts with a skip link and keeps one main landmark after the banner", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={parseDataset(minimalDataset)} />);

    await user.tab();
    const skipLink = screen.getByRole("link", { name: "Skip to current decision" });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute("href", "#game-content");
    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute("id", "game-content");
    expect(screen.getByRole("banner").closest("main")).toBeNull();
  });

  it("announces the current stage and detail in an ordered run progress", () => {
    render(<RunProgress stage="igl" detail="Pick 2 of 5" />);

    const progress = screen.getByRole("navigation", { name: "Run progress" });
    const list = within(progress).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Draft",
      "IGL",
      "Tournament",
      "Recap",
    ]);
    expect(within(progress).getByText("IGL").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("Pick 2 of 5");
  });

  it("delivers simulated animation-end events through React", () => {
    const ended = vi.fn();
    render(<button onAnimationEnd={ended}>event delivery</button>);
    animationEnd(screen.getByRole("button", { name: "event delivery" }), "ignite-a");
    expect(ended).toHaveBeenCalledOnce();
    expect(ended.mock.calls[0][0].nativeEvent.animationName).toBe("ignite-a");
  });
  it("exposes the selected game mode, home action, and draft progress semantically", async () => {
    const onHome = vi.fn();
    render(<><AppHeader mode="daily" stage="draft" detail="Pick 2 of 5 · Choose a team to scout" onHome={onHome} onExit={vi.fn()} /><TeamOffer teams={teams} rerolls={2} canReroll onChoose={vi.fn()} onReroll={vi.fn()} /></>);
    expect(screen.getByLabelText("Current mode")).toHaveTextContent("Daily");
    expect(screen.getByText("Draft").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Run It Back home" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Run It Back home" }));
    expect(onHome).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Exit run" })).toBeVisible();
    expect(screen.getByText("This replaces every team in the current offer.")).toHaveAttribute("aria-live", "polite");
  });

  it("gives a successful reroll a finite, retriggerable fire accent", () => {
    vi.useFakeTimers();
    const reroll = vi.fn();
    render(<TeamOffer teams={teams} rerolls={2} canReroll onChoose={vi.fn()} onReroll={reroll} />);
    const button = screen.getByRole("button", { name: "Replace all 3 teams · 2 left" });

    fireEvent.click(button);
    expect(reroll).toHaveBeenCalledOnce();
    expect(button).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    expect(button).not.toHaveClass("fire-accent");

    fireEvent.click(button);
    expect(button).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    expect(button).not.toHaveClass("fire-accent");
    vi.useRealTimers();
  });

  it("rearms a fire accent under StrictMode and ignores a stale animation end", () => {
    vi.useFakeTimers();
    render(<StrictMode><AccentProbe /></StrictMode>);
    const button = screen.getByRole("button", { name: "ignite" });
    fireEvent.click(button);
    expect(button).toHaveClass("fire-accent");
    fireEvent.click(button);
    expect(button).not.toHaveClass("fire-accent");
    animationEnd(button, "ignite-a");
    act(() => vi.advanceTimersByTime(20));
    expect(button).toHaveClass("fire-accent");
    animationEnd(button, "ignite-a");
    expect(button).toHaveClass("fire-accent");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(20));
    expect(button).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    expect(button).not.toHaveClass("fire-accent");
    vi.useRealTimers();
  });

  it("ignores generation N's animation end when the same animation name returns in N+2", () => {
    vi.useFakeTimers();
    try {
      render(<StrictMode><AccentProbe /></StrictMode>);
      const button = screen.getByRole("button", { name: "ignite" });
      fireEvent.click(button);
      const firstName = button.classList.contains("fire-accent--b") ? "ignite-b" : "ignite-a";
      for (let replay = 0; replay < 2; replay += 1) {
        fireEvent.click(button);
        act(() => vi.advanceTimersToNextFrame());
      }
      expect(button).toHaveClass(`fire-accent--${firstName.at(-1)}`);
      animationEnd(button, firstName);
      expect(button).toHaveClass("fire-accent");
      act(() => vi.advanceTimersByTime(199));
      expect(button).toHaveClass("fire-accent");
      act(() => vi.advanceTimersByTime(1));
      expect(button).not.toHaveClass("fire-accent");
    } finally { vi.useRealTimers(); }
  });

  it("gives a replay its full lifetime beyond the previous generation's deadline", () => {
    vi.useFakeTimers();
    try {
      render(<AccentProbe />);
      const button = screen.getByRole("button", { name: "ignite" });
      fireEvent.click(button);
      act(() => vi.advanceTimersByTime(120));
      fireEvent.click(button);
      act(() => vi.advanceTimersToNextFrame());
      act(() => vi.advanceTimersByTime(199));
      expect(button).toHaveClass("fire-accent");
      act(() => vi.advanceTimersByTime(1));
      expect(button).not.toHaveClass("fire-accent");
    } finally { vi.useRealTimers(); }
  });

  it.each([false, true])("cancels pending fire work on unmount (replay pending: %s)", replay => {
    vi.useFakeTimers();
    try {
      const view = render(<AccentProbe />);
      const button = screen.getByRole("button", { name: "ignite" });
      fireEvent.click(button);
      if (replay) fireEvent.click(button);
      expect(vi.getTimerCount()).toBe(1);
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("keeps the complete roster out of a horizontal keyboard scroller", () => {
    render(<RosterBar slots={{}} onMove={vi.fn()} canMove={false} />);
    const roster = screen.getByRole("region", { name: "Roster · 0 of 5 filled" });
    expect(roster).not.toHaveAttribute("tabindex");
    expect(roster).not.toHaveClass("scroll-track");
    expect(fireEvent.keyDown(roster, { key: "ArrowRight" })).toBe(true);
    expect(within(roster).getAllByRole("listitem")).toHaveLength(5);
  });

  it("keeps draft portraits decorative and leader radios named by handle and year", () => {
    const cards = parseDataset(minimalDataset).cards.slice(0, 5);
    render(<>
      <PlayerPicker team={teams[0]} cards={cards} openRoles={["smokes", "duelist", "initiator", "sentinel", "flex"]} portraitForPlayer={playerId => playerId === cards[0].playerId ? "/assets/players/test.webp" : null} onChoose={vi.fn()} onBack={vi.fn()} />
      <IglPicker cards={cards} selectedId={null} portraitForPlayer={playerId => playerId === cards[0].playerId ? "/assets/players/test.webp" : null} onSelect={vi.fn()} onStart={vi.fn()} />
    </>);

    for (const card of cards) {
      const choice = screen.getByRole("button", { name: `${card.displayHandle} ${card.year}` });
      expect(within(choice).queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByRole("radio", { name: `${card.displayHandle} ${card.year}` })).toBeVisible();
    }
  });

  it("uses peer h2 headings for the completed lineup and IGL decision", () => {
    const active = activeState();
    render(<GameApp dataset={fixtureDataset} initialState={{ phase: "lineup", mode: "daily", draft: active.draft }} />);
    const roster = screen.getByRole("region", { name: "Roster · 5 of 5 filled" });
    const rosterHeading = within(roster).getByRole("heading", { name: "Roster · 5 of 5 filled" });
    const iglHeading = screen.getByRole("heading", { name: "Choose your IGL" });

    expect(rosterHeading.tagName).toBe("H2");
    expect(iglHeading.tagName).toBe("H2");
    expect(rosterHeading.compareDocumentPosition(iglHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("explains why tournament start is disabled until a valid IGL is selected", () => {
    const cards = parseDataset(minimalDataset).cards.slice(0, 5);
    const view = render(<IglPicker cards={cards} selectedId="stale" onSelect={vi.fn()} onStart={vi.fn()} />);
    const start = screen.getByRole("button", { name: "Start tournament" });
    const guidance = screen.getByText("Choose an IGL to enter the tournament.");

    expect(guidance).toBeVisible();
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription("Choose an IGL to enter the tournament.");

    view.rerender(<IglPicker cards={cards} selectedId={cards[0].id} onSelect={vi.fn()} onStart={vi.fn()} />);
    expect(screen.queryByText("Choose an IGL to enter the tournament.")).not.toBeInTheDocument();
    expect(start).toBeEnabled();
    expect(start).not.toHaveAttribute("aria-describedby");
  });

  it("uses purposeful progress language without exposing reducer phases", () => {
    render(<GameApp dataset={parseDataset(minimalDataset)} now={() => new Date("2026-09-05T12:00:00Z")} />);
    expect(screen.queryByText(/Current phase:/)).not.toBeInTheDocument();
    const daily = screen.getByRole("button", { name: "Start today's Daily" });
    daily.focus();
    expect(document.activeElement).toBe(daily);
    fireEvent.click(daily);
    const progress = screen.getByRole("navigation", { name: "Run progress" });
    expect(within(progress).getByText("Draft").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(progress).getByRole("status")).toHaveTextContent("Pick 1 of 5 · Choose a team to scout");
    expect(screen.queryByText(/Current phase:/)).not.toBeInTheDocument();
  });

  it("moves focus to each new drafting decision without adding it to the tab order", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={parseDataset(minimalDataset)} freeSeedFactory={() => "focus-draft"} />);
    await user.click(screen.getByRole("button", { name: "Start Free Play" }));
    const teamHeading = screen.getByRole("heading", { name: "Choose a team to scout" });
    expect(teamHeading).toHaveFocus();
    expect(teamHeading).toHaveAttribute("tabindex", "-1");

    await user.click(document.querySelector<HTMLElement>("[data-team-id]")!);
    const playerHeading = screen.getByRole("heading", { name: /Choose from/ });
    expect(playerHeading).toHaveFocus();
    expect(playerHeading).toHaveAttribute("tabindex", "-1");
  });

  it("fires the persistent shell after player and tournament lock-ins", () => {
    vi.useFakeTimers();
    const dataset = parseDataset(minimalDataset);
    const first = render(<GameApp dataset={dataset} now={() => new Date("2026-09-05T12:00:00Z")} />);
    fireEvent.click(screen.getByRole("button", { name: "Start today's Daily" }));
    fireEvent.click(screen.getAllByRole("button").find(button => button.dataset.teamId)!);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(screen.getAllByRole("button").find(button => button.closest("[data-testid]") !== null)!);
    const shell = document.querySelector("main")!;
    expect(screen.getByRole("heading", { name: /Where should .* play\?/ })).toBeVisible();
    expect(shell).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    expect(shell).not.toHaveClass("fire-accent");
    first.unmount();

    const active = activeState();
    render(<GameApp dataset={dataset} initialState={{ phase: "lineup", mode: "daily", draft: active.draft }} />);
    fireEvent.click(screen.getByRole("radio", { checked: true }));
    fireEvent.click(screen.getByRole("button", { name: "Start tournament" }));
    expect(document.querySelector("main")).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    vi.useRealTimers();
  });

  it("accents a winning series and a champion result until the finite fallback", () => {
    vi.useFakeTimers();
    const opponent = { generateOpponent: () => null };
    void opponent;
    render(<TournamentView tournament={activeState().tournament} opponent={{ id: "opponent", stage: "group", lineup, strength: 60 }} cards={fixtureDataset.cards} result={series("group", true)} revealComplete resolving={false} error={null} onPlay={vi.fn()} onRetryOpponent={vi.fn()} onRetrySeries={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Series result: Win, 2–1" }).parentElement).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    const champion = terminalState(true);
    render(<ResultsView mode="daily" result={projectTerminalResult(champion.tournament)} cards={fixtureDataset.cards} highlights={[]} rerollsUsed={0} shareText="share" onRunAgain={vi.fn()} onModeChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Results" })).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(200));
    vi.useRealTimers();
  });
});
