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
import { readFileSync } from "node:fs";
import { join } from "node:path";

function AccentProbe() { const fire = useFireAccent(); return <button className={fire.fireClass} onAnimationEnd={fire.onAnimationEnd} onClick={fire.trigger}>ignite</button>; }

const teams: TeamAppearance[] = [
  { id: "one", name: "One", shortName: "ONE", year: 2024, logo: null, sourceIds: [] },
  { id: "two", name: "Two", shortName: "TWO", year: 2024, logo: null, sourceIds: [] },
  { id: "three", name: "Three", shortName: "THREE", year: 2024, logo: null, sourceIds: [] },
];

describe("broadcast accessibility", () => {
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
    act(() => vi.advanceTimersByTime(20));
    expect(button).toHaveClass("fire-accent");
    act(() => vi.advanceTimersByTime(650));
    expect(button).not.toHaveClass("fire-accent");
    vi.useRealTimers();
  });

  it("keeps focus visible and changes a live phase status from mode to team", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    render(<GameApp dataset={parseDataset(minimalDataset)} now={() => new Date("2026-09-05T12:00:00Z")} />);
    const daily = screen.getByRole("button", { name: "Daily" });
    daily.focus();
    expect(document.activeElement).toBe(daily);
    expect(css).toMatch(/:focus-visible\s*\{[\s\S]*?outline:3px solid var\(--action\);[\s\S]*?outline-offset:3px/);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Current phase: mode");
    fireEvent.click(daily);
    expect(status).toHaveTextContent("Current phase: team");
  });

  it("preserves static fire feedback for reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/scroll-behavior:auto !important/);
    expect(reduced).toMatch(/transition-duration:0\.01ms !important/);
    expect(reduced).toMatch(/\.fire-accent\s*\{[^}]*outline:3px solid var\(--heat\)[^}]*color:var\(--heat\)/);
    expect(reduced).toMatch(/\.fire-accent::before,\.fire-accent::after\s*\{[^}]*animation:none !important[^}]*opacity:1/);
    expect(reduced).not.toMatch(/\.fire-accent[^}]*display:none|\.fire-accent[^}]*opacity:0/);
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
