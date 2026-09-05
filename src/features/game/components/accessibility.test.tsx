import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { AppHeader } from "./app-header";
import { TeamOffer } from "./team-offer";
import type { TeamAppearance } from "../domain";
import { useFireAccent } from "./use-fire-accent";

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
});
