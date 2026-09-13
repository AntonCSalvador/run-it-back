import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModeSelection } from "./mode-selection";

const base = {
  dailyState: "available" as const,
  streak: 0,
  onStart: vi.fn(),
  onViewDailyResult: vi.fn(),
};

describe("ModeSelection saved run", () => {
  it("offers explicit continuation instead of fresh modes", () => {
    const onContinueSavedRun = vi.fn();
    const onStartOver = vi.fn();
    render(<ModeSelection {...base}
      savedRun={{ mode: "free-play", detail: "Pick 2 of 5 · Choose a player" }}
      onContinueSavedRun={onContinueSavedRun}
      onStartOver={onStartOver}
    />);
    expect(screen.getByRole("heading", { name: "Unfinished Free Play run" })).toBeVisible();
    expect(screen.getByText("Pick 2 of 5 · Choose a player")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start Free Play" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue saved run" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onContinueSavedRun).toHaveBeenCalledOnce();
    expect(onStartOver).toHaveBeenCalledOnce();
  });
  it("keeps normal choices when no saved run exists", () => {
    render(<ModeSelection {...base} savedRun={null} onContinueSavedRun={vi.fn()} onStartOver={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
  });
});
