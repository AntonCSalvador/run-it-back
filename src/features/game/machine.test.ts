import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES, type GameDataset } from "./domain";
import { LocalSimulationGateway } from "./gateway";
import { createGameReducer, createStartAction, initialGameState, type GameState } from "./machine";
import { parseDataset } from "./schema";

const dataset = parseDataset(minimalDataset) as GameDataset;

function draftLineup(reduce: ReturnType<typeof createGameReducer>, started: GameState): GameState {
  let state = started;
  for (const role of ROLES) {
    if (state.phase !== "team") throw new Error("Expected a team offer");
    const teamDraft = state.draft;
    const teamId = teamDraft.offeredTeamIds.find(id => dataset.cards.some(card => card.teamId === id && card.eligibleRoles.includes(role) && !Object.values(teamDraft.slots).includes(card.id)));
    if (!teamId) throw new Error(`No offered card for ${role}`);
    state = reduce(state, { type: "choose-team", teamId });
    if (state.phase !== "player") throw new Error("Expected player phase");
    const playerDraft = state.draft;
    const cardId = dataset.cards.find(card => card.teamId === teamId && card.eligibleRoles.includes(role) && !Object.values(playerDraft.slots).includes(card.id))?.id;
    if (!cardId) throw new Error(`No card for ${role}`);
    state = reduce(state, { type: "choose-card", cardId });
    expect(state.phase).toBe("role");
    state = reduce(state, { type: "assign-role", role });
  }
  return state;
}

describe("game reducer", () => {
  it("separates dataset-only reducer dependencies from seed-generation dependencies", () => {
    expectTypeOf<keyof Parameters<typeof createGameReducer>[0]>().toEqualTypeOf<"dataset">();
    expectTypeOf<keyof NonNullable<Parameters<typeof createStartAction>[1]>>().toEqualTypeOf<"now" | "freeSeedFactory">();
  });
  it("moves through mode, draft phases, tournament, and results", () => {
    const reduce = createGameReducer({ dataset });
    expect(initialGameState.phase).toBe("mode");
    let state = reduce(initialGameState, createStartAction("daily", { now: () => new Date("2026-09-05T12:00:00Z") }));
    expect(state.phase).toBe("team");
    state = reduce(state, { type: "reroll" });
    expect(state.phase).toBe("team");
    state = draftLineup(reduce, state);
    expect(state.phase).toBe("lineup");
    if (state.phase !== "lineup") throw new Error("Expected lineup");
    const lineupDraft = state.draft;
    state = reduce(state, { type: "tag-igl", cardId: lineupDraft.slots.smokes! });
    state = reduce(state, { type: "enter-tournament" });
    expect(state.phase).toBe("tournament");
    while (state.phase === "tournament") {
      const tournamentState = state;
      const gateway = new LocalSimulationGateway(dataset);
      const lineup = { slots: ROLES.map(role => ({ role, cardId: tournamentState.draft.slots[role]! })), iglCardId: tournamentState.draft.iglCardId! };
      const opponent = gateway.generateOpponent(tournamentState.tournament.seed, tournamentState.tournament.currentStage, lineup);
      const series = gateway.playSeries(tournamentState.tournament.seed, tournamentState.tournament.currentStage, lineup, opponent);
      state = reduce(tournamentState, { type: "resolve-series", series });
    }
    expect(state.phase).toBe("results");
  });

  it("rejects invalid phase events without mutating state", () => {
    const reduce = createGameReducer({ dataset });
    expect(() => reduce(initialGameState, { type: "reroll" })).toThrow("not valid during mode");
    expect(initialGameState).toEqual({ phase: "mode" });
  });

  it("uses the injected UTC date for daily seeds", () => {
    const reduce = createGameReducer({ dataset });
    const state = reduce(initialGameState, createStartAction("daily", { now: () => new Date("2026-09-06T00:15:00+02:00") }));
    expect(state).toMatchObject({ phase: "team", draft: { seed: "run-it-back:daily:2026-09-05:v1" } });
  });

  it("uses supplied free-play seeds only when start actions are handled", () => {
    const seeds = ["free-one", "free-two"];
    const reduce = createGameReducer({ dataset });
    const first = reduce(initialGameState, createStartAction("free-play", { freeSeedFactory: () => seeds.shift()! }));
    const second = reduce(reduce(first, { type: "restart" }), createStartAction("free-play", { freeSeedFactory: () => seeds.shift()! }));
    expect([first, second].map(state => state.phase === "team" ? state.draft.seed : null)).toEqual(["free-one", "free-two"]);
  });

  it("is deterministic for a supplied start action without consuming seed factories", () => {
    const factory = vi.fn(() => "fixed");
    const action = createStartAction("free-play", { freeSeedFactory: factory });
    const reduce = createGameReducer({ dataset });
    expect(reduce(initialGameState, action)).toEqual(reduce(initialGameState, action));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("keeps presentation timing actions referentially unchanged", () => {
    const reduce = createGameReducer({ dataset });
    expect(reduce(initialGameState, { type: "change-speed", speed: "fast" })).toBe(initialGameState);
    expect(reduce(initialGameState, { type: "skip-reveal" })).toBe(initialGameState);
  });
});
