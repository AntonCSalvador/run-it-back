import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES, type Lineup } from "../domain";
import { LocalSimulationGateway } from "../gateway";
import type { Highlight } from "../narration";
import type { Stage } from "../opponents";
import { parseDataset } from "../schema";
import { startTournament, type SeriesResult } from "../tournament";
import type { GameState } from "../machine";
import { GameApp } from "./game-app";
import { HighlightFeed } from "./highlight-feed";
import { ResultsView } from "./results-view";

const dataset = parseDataset(minimalDataset);
const lineup: Lineup = { slots: ROLES.map((role, index) => ({ role, cardId: dataset.cards[index].id })), iglCardId: dataset.cards[0].id };
const activeState: GameState = { phase: "tournament", mode: "daily", draft: { seed: "seed", offerIndex: 5, rerollsRemaining: 3, offeredTeamIds: [], selectedTeamId: null, pendingCardId: null, slots: Object.fromEntries(lineup.slots.map(slot => [slot.role, slot.cardId])), iglCardId: lineup.iglCardId }, tournament: startTournament("seed", lineup) };
function series(stage: Stage): SeriesResult { return { stage, bestOf: stage === "final" ? 5 : 3, userWins: 2, opponentWins: 0, maps: (["Ascent", "Bind"] as const).map(map => ({ map, winner: "user" as const, userScore: 13, opponentScore: 7, probability: .6, roll: .2 })) }; }
function gatewayFixture() { const local = new LocalSimulationGateway(dataset); return { generateOpponent: vi.fn(local.generateOpponent.bind(local)), playSeries: vi.fn((_seed: string, stage: Stage) => series(stage)), createHighlights: vi.fn((): readonly Highlight[] => []) }; }

describe("tournament presentation", () => {
  it("shows the generated five-player opponent before playing and advances only after Continue", async () => {
    const gateway = gatewayFixture();
    render(<GameApp dataset={dataset} initialState={activeState} gateway={gateway} />);
    expect(screen.getByRole("heading", { name: "Group stage" })).toBeVisible();
    expect(screen.getAllByText(/IGL/)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Play series" })).toBeVisible();
    expect(screen.queryByText(/strength|probability|roll/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Play series" }));
    expect(gateway.playSeries).toHaveBeenCalledWith("seed", "group", lineup, gateway.generateOpponent.mock.results[0].value);
    expect(screen.getByText("2–0")).toBeVisible();
    expect(screen.getByText("Ascent 13–7")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Group stage" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Quarterfinal" })).toBeVisible();
  });

  it("reveals highlights at the selected speed and Skip completes once", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const highlights: Highlight[] = [0, 1].map(index => ({ id: String(index), kind: "ace", actorCardId: "a", side: "user", text: `simulated ${index}`, emphasis: "normal", map: "Ascent", mapIndex: 0 }));
    render(<HighlightFeed highlights={highlights} onComplete={done} />);
    expect(screen.getByText("simulated 0")).toBeVisible();
    act(() => { vi.advanceTimersByTime(1599); });
    expect(screen.queryByText("simulated 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.getByText("simulated 1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("shares with clipboard fallback and exposes selected text when sharing is unavailable", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, value: { writeText } });
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined });
    render(<ResultsView mode="daily" tournament={{ ...activeState.tournament, status: "eliminated", completedSeries: [series("group")] }} cards={dataset.cards} rerollsUsed={1} shareText="safe summary" onRunAgain={() => undefined} onModeChange={() => undefined} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByDisplayValue("safe summary")).toBeVisible();
  });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
