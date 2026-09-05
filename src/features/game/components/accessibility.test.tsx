import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
import { RosterBar } from "./roster-bar";

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
  it("delivers simulated animation-end events through React", () => {
    const ended = vi.fn();
    render(<button onAnimationEnd={ended}>event delivery</button>);
    animationEnd(screen.getByRole("button", { name: "event delivery" }), "ignite-a");
    expect(ended).toHaveBeenCalledOnce();
    expect(ended.mock.calls[0][0].nativeEvent.animationName).toBe("ignite-a");
  });
  it("exposes the selected game mode and draft progress semantically", () => {
    render(<><AppHeader mode="daily" streak={2} onStart={vi.fn()} onRestart={vi.fn()} /><TeamOffer teams={teams} rerolls={2} onChoose={vi.fn()} onReroll={vi.fn()} /></>);
    expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 rerolls remaining")).toHaveAttribute("aria-live", "polite");
  });

  it("gives a successful reroll a finite, retriggerable fire accent", () => {
    vi.useFakeTimers();
    const reroll = vi.fn();
    render(<TeamOffer teams={teams} rerolls={2} onChoose={vi.fn()} onReroll={reroll} />);
    const button = screen.getByRole("button", { name: /reroll teams/i });

    fireEvent.click(button);
    expect(reroll).toHaveBeenCalledOnce();
    expect(button).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
    expect(button).not.toHaveClass("fire-accent");

    fireEvent.click(button);
    expect(button).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
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
    act(() => vi.advanceTimersByTime(650));
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
      act(() => vi.advanceTimersByTime(649));
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
      act(() => vi.advanceTimersByTime(400));
      fireEvent.click(button);
      act(() => vi.advanceTimersToNextFrame());
      act(() => vi.advanceTimersByTime(649));
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

  it("lets CSS choose keyboard scroll motion and prevents arrow-key page scrolling", () => {
    render(<RosterBar slots={{}} onMove={vi.fn()} canMove={false} />);
    const roster = screen.getByRole("region", { name: "Roster" });
    const scrollBy = vi.fn();
    Object.defineProperty(roster, "scrollBy", { configurable: true, value: scrollBy });
    roster.focus();
    expect(roster).toHaveFocus();
    expect(fireEvent.keyDown(roster, { key: "ArrowRight" })).toBe(false);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 260 });
    expect(fireEvent.keyDown(roster, { key: "ArrowLeft" })).toBe(false);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -260 });
    expect(fireEvent.keyDown(roster, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(screen.getByText("duelist"), { key: "ArrowRight" })).toBe(true);
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("allows keyboard focus and changes a live phase status from mode to team", () => {
    render(<GameApp dataset={parseDataset(minimalDataset)} now={() => new Date("2026-09-05T12:00:00Z")} />);
    const daily = screen.getByRole("button", { name: "Daily" });
    daily.focus();
    expect(document.activeElement).toBe(daily);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Current phase: mode");
    fireEvent.click(daily);
    expect(status).toHaveTextContent("Current phase: team");
  });

  it("fires the persistent shell after player and tournament lock-ins", () => {
    vi.useFakeTimers();
    const dataset = parseDataset(minimalDataset);
    const first = render(<GameApp dataset={dataset} now={() => new Date("2026-09-05T12:00:00Z")} />);
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    fireEvent.click(screen.getAllByRole("button").find(button => button.dataset.teamId)!);
    act(() => vi.advanceTimersByTime(650));
    fireEvent.click(screen.getAllByRole("button").find(button => button.closest("[data-testid]") !== null)!);
    const shell = document.querySelector("main")!;
    expect(screen.getByRole("heading", { name: /Assign/ })).toBeVisible();
    expect(shell).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
    expect(shell).not.toHaveClass("fire-accent");
    first.unmount();

    const active = activeState();
    render(<GameApp dataset={dataset} initialState={{ phase: "lineup", mode: "daily", draft: active.draft }} />);
    fireEvent.click(screen.getByRole("radio", { checked: true }));
    fireEvent.click(screen.getByRole("button", { name: "Start tournament" }));
    expect(document.querySelector("main")).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
    vi.useRealTimers();
  });

  it("accents a winning series and a champion result until the finite fallback", () => {
    vi.useFakeTimers();
    const opponent = { generateOpponent: () => null };
    void opponent;
    render(<TournamentView opponent={{ id: "opponent", stage: "group", lineup, strength: 60 }} userLineup={lineup} cards={fixtureDataset.cards} result={series("group", true)} onPlay={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole("status", { name: "Series result announcement" })).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
    const champion = terminalState(true);
    render(<ResultsView mode="daily" tournament={champion.tournament} cards={fixtureDataset.cards} rerollsUsed={0} shareText="share" onRunAgain={vi.fn()} onModeChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Results" })).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
    vi.useRealTimers();
  });
});
