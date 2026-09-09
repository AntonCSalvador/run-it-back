import { describe, expect, it } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES, type Lineup } from "./domain";
import { createDraft, type DraftState } from "./draft";
import { LocalSimulationGateway, type SimulationGateway } from "./gateway";
import { createGameReducer, type GameState } from "./machine";
import { parseDataset } from "./schema";
import { advanceTournament, MAP_POOL, startTournament, type SeriesResult } from "./tournament";
import { restoreActiveRun, serializeActiveRun } from "./active-run";
import type { ActiveRunStorage } from "./storage";
import { dailySeed } from "./rng";

const dataset = parseDataset(minimalDataset);
const gateway = new LocalSimulationGateway(dataset);
const reducer = createGameReducer({ dataset });

type PlayerState = { phase: "player"; mode: "free-play"; draft: DraftState };
type LineupState = { phase: "lineup"; mode: "free-play"; draft: DraftState };

function firstPlayerState(): PlayerState {
  const draft = createDraft("active-run-seed", dataset);
  return reducer({ phase: "team", mode: "free-play", draft }, { type: "choose-team", teamId: draft.offeredTeamIds[0] }) as PlayerState;
}

function completeDraft(): LineupState {
  let state: GameState = { phase: "mode" };
  state = reducer(state, { type: "start", mode: "free-play", seed: "active-run-seed" });
  while (state.phase !== "lineup") {
    if (state.phase === "team") state = reducer(state, { type: "choose-team", teamId: state.draft.offeredTeamIds[0] });
    else if (state.phase === "player") {
      const draft = state.draft;
      const occupied = new Set(Object.values(draft.slots));
      const card = dataset.cards.find(candidate => candidate.teamId === draft.selectedTeamId && !occupied.has(candidate.id) && candidate.eligibleRoles.some(role => !draft.slots[role]));
      if (!card) throw new Error("fixture cannot choose card");
      state = reducer(state, { type: "choose-card", cardId: card.id });
    } else if (state.phase === "role") {
      const draft = state.draft;
      const card = dataset.cards.find(candidate => candidate.id === draft.pendingCardId)!;
      const role = card.eligibleRoles.find(candidate => !draft.slots[candidate]);
      if (!role) throw new Error("fixture cannot assign role");
      state = reducer(state, { type: "assign-role", role });
    }
  }
  return state as LineupState;
}

function publicSeries(stage: "group" | "quarterfinal" | "semifinal") {
  const lineup = completeLineup();
  const opponent = gateway.generateOpponent("active-run-seed", stage, lineup);
  const result = gateway.playSeries("active-run-seed", stage, lineup, opponent);
  if (result instanceof Promise) throw new Error("fixture gateway must be synchronous");
  return result;
}

function winningSeries(stage: "group" | "quarterfinal" | "semifinal" | "final"): SeriesResult {
  const count = stage === "final" ? 3 : 2;
  return { stage, bestOf: stage === "final" ? 5 : 3, userWins: count, opponentWins: 0, maps: MAP_POOL.slice(0, count).map(map => ({ map, userScore: 13, opponentScore: 7, winner: "user" as const, probability: 0.6, roll: 0.2 })) };
}

const winningGateway: SimulationGateway = {
  generateOpponent: gateway.generateOpponent.bind(gateway),
  playSeries: (_seed, stage) => winningSeries(stage),
  createHighlights: (_seed, result, userLineup) => [{ id: `${result.stage}-decisive`, kind: "ace", actorCardId: userLineup.iglCardId, side: "user", text: "Repository-backed simulated moment.", emphasis: "decisive", map: result.maps[0].map, mapIndex: 0 }],
};

type MutableStoredRun = {
  phase: string;
  draft: { offeredTeamIds: string[]; slots: Record<string, string>; rerollsRemaining: number; iglCardId: string | null };
  tournament?: { currentStage: string; completedSeries: { stage: string; userWins: number; opponentWins: number; maps: { map: string; userScore: number; opponentScore: number }[] }[] };
};

function mutableStoredRun(state: GameState): MutableStoredRun {
  return structuredClone(serializeActiveRun(state)) as unknown as MutableStoredRun;
}

async function restoreTampered(run: MutableStoredRun) {
  return restoreActiveRun(run as unknown as ActiveRunStorage["run"], dataset, gateway);
}

function completeLineup(): Lineup {
  const state = completeDraft();
  const cardId = Object.values(state.draft.slots)[0]!;
  const tagged = reducer(state, { type: "tag-igl", cardId }) as LineupState;
  return { slots: ROLES.map(role => ({ role, cardId: tagged.draft.slots[role]! })), iglCardId: tagged.draft.iglCardId! };
}

describe("active run persistence", () => {
  it("serializes only public draft fields and restores a deterministic player decision", async () => {
    const state = firstPlayerState();
    const stored = serializeActiveRun(state);
    const json = JSON.stringify(stored);
    expect(json).not.toMatch(/"(?:traits|strength|probability|roll|results)"\s*:/i);
    expect((await restoreActiveRun(stored, dataset, gateway))?.state).toEqual(state);
  });

  it("restores the completed roster before an IGL has been selected", async () => {
    const state = completeDraft();
    expect(state.draft.iglCardId).toBeNull();
    expect((await restoreActiveRun(serializeActiveRun(state), dataset, gateway))?.state).toEqual(state);
  });

  it.each([
    ["free seed relabeled as Daily", "active-run-seed"],
    ["malformed Daily seed", "run-it-back:daily:not-a-date:v1"],
  ])("rejects %s", async (_case, seed) => {
    const state = firstPlayerState();
    const run = structuredClone(serializeActiveRun(state))!;
    expect(await restoreActiveRun({ ...run, mode: "daily", draft: { ...run.draft, seed } }, dataset, gateway)).toBeNull();
  });

  it("accepts a current-format Daily seed", async () => {
    const seed = dailySeed(new Date("2026-09-07T12:00:00Z"));
    const draft = createDraft(seed, dataset);
    const state = { phase: "player", mode: "daily", draft: { ...draft, selectedTeamId: draft.offeredTeamIds[0] } } as const;
    expect((await restoreActiveRun(serializeActiveRun(state), dataset, gateway))?.state).toEqual(state);
  });

  it.each([
    ["unknown offer", (run: MutableStoredRun) => { run.draft.offeredTeamIds[0] = "missing"; }],
    ["duplicate cards", (run: MutableStoredRun) => { run.draft.slots = { smokes: dataset.cards[0].id, duelist: dataset.cards[0].id }; }],
    ["invalid role", (run: MutableStoredRun) => { run.draft.slots = { smokes: dataset.cards.find(card => !card.eligibleRoles.includes("smokes"))!.id }; }],
    ["invalid rerolls", (run: MutableStoredRun) => { run.draft.rerollsRemaining = 4; }],
    ["unrostered IGL", (run: MutableStoredRun) => { run.draft.iglCardId = "missing"; }],
    ["invalid phase", (run: MutableStoredRun) => { run.phase = "results"; }],
  ])("rejects draft tampering: %s", async (_name, tamper) => {
    const run = mutableStoredRun(firstPlayerState());
    tamper(run);
    expect(await restoreTampered(run)).toBeNull();
  });

  it("reconstructs tournament summaries and retained semifinal highlights", async () => {
    const lineup = completeLineup();
    let tournament = startTournament("active-run-seed", lineup);
    for (const stage of ["group", "quarterfinal", "semifinal"] as const) {
      const result = winningSeries(stage);
      tournament = advanceTournament({ ...tournament, completedSeries: [...tournament.completedSeries, result] });
    }
    const lineupState = completeDraft();
    const state: GameState = { phase: "tournament", mode: "free-play", draft: { ...lineupState.draft, iglCardId: lineup.iglCardId }, tournament };
    const stored = serializeActiveRun(state);
    const restored = await restoreActiveRun(stored, dataset, winningGateway);
    expect(restored?.state).toEqual(state);
    expect(restored?.highlights).toHaveLength(1);
    expect(restored?.highlights.every(item => item.kind === "clutch" || item.emphasis === "clutch" || item.emphasis === "decisive")).toBe(true);
  });

  it("rejects impossible and mismatched tournament summaries", async () => {
    const lineup = completeLineup();
    const state: GameState = { phase: "tournament", mode: "free-play", draft: { ...completeDraft().draft, iglCardId: lineup.iglCardId }, tournament: startTournament("active-run-seed", lineup) };
    const impossible = mutableStoredRun(state);
    impossible.tournament!.currentStage = "semifinal";
    expect(await restoreTampered(impossible)).toBeNull();
    const mismatched = mutableStoredRun(state);
    mismatched.tournament!.completedSeries = [{ stage: "group", userWins: 2, opponentWins: 0, maps: [{ map: "Ascent", userScore: 13, opponentScore: 0 }, { map: "Bind", userScore: 13, opponentScore: 0 }] }];
    mismatched.tournament!.currentStage = "quarterfinal";
    expect(await restoreTampered(mismatched)).toBeNull();
  });

  it("awaits an async gateway when reconstructing completed rounds", async () => {
    const lineup = completeLineup();
    const group = winningSeries("group");
    const tournament = advanceTournament({ ...startTournament("active-run-seed", lineup), completedSeries: [group] });
    const state: GameState = { phase: "tournament", mode: "free-play", draft: { ...completeDraft().draft, iglCardId: lineup.iglCardId }, tournament };
    const asyncGateway: SimulationGateway = { ...winningGateway, playSeries: async (_seed, stage) => winningSeries(stage) };

    expect((await restoreActiveRun(serializeActiveRun(state), dataset, asyncGateway))?.state).toEqual(state);
  });

  it.each(["rejects", "mismatches"] as const)("returns null when an async gateway %s", async behavior => {
    const lineup = completeLineup();
    const group = winningSeries("group");
    const tournament = advanceTournament({ ...startTournament("active-run-seed", lineup), completedSeries: [group] });
    const state: GameState = { phase: "tournament", mode: "free-play", draft: { ...completeDraft().draft, iglCardId: lineup.iglCardId }, tournament };
    const asyncGateway: SimulationGateway = {
      ...winningGateway,
      playSeries: behavior === "rejects"
        ? async () => { throw new Error("gateway unavailable"); }
        : async (_seed, stage) => ({ ...winningSeries(stage), maps: winningSeries(stage).maps.map((map, index) => index ? map : { ...map, opponentScore: 8 }) }),
    };

    expect(await restoreActiveRun(serializeActiveRun(state), dataset, asyncGateway)).toBeNull();
  });

  it("does not persist mode or completed results", () => {
    expect(serializeActiveRun({ phase: "mode" })).toBeNull();
    const lineup = completeLineup();
    const tournament = advanceTournament({ ...startTournament("active-run-seed", lineup), completedSeries: [publicSeries("group")] });
    const state = { phase: "results", mode: "free-play", draft: { ...completeDraft().draft, iglCardId: lineup.iglCardId }, tournament } as GameState;
    expect(serializeActiveRun(state)).toBeNull();
  });
});
