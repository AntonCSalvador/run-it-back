import { ROLES, type GameDataset, type Lineup } from "./domain";
import { createOffer, isLineupReady, selectableCards, toLineup, type DraftState } from "./draft";
import type { SimulationGateway } from "./gateway";
import type { GameState } from "./machine";
import type { Highlight } from "./narration";
import { STAGE_ORDER, advanceTournament, startTournament, type SeriesResult } from "./tournament";
import { ACTIVE_RECORD, type ActiveRunStorage } from "./storage";
import { dailyDateFromSeed } from "./rng";

export interface RestoredActiveRun { readonly state: GameState; readonly highlights: readonly Highlight[] }

function publicDraft(draft: DraftState): DraftState {
  return {
    seed: draft.seed, offerIndex: draft.offerIndex, rerollsRemaining: draft.rerollsRemaining,
    offeredTeamIds: [...draft.offeredTeamIds], selectedTeamId: draft.selectedTeamId, pendingCardId: draft.pendingCardId,
    slots: Object.fromEntries(ROLES.flatMap(role => draft.slots[role] ? [[role, draft.slots[role]!] as const] : [])), iglCardId: draft.iglCardId,
  };
}

export function serializeActiveRun(state: GameState): ActiveRunStorage["run"] {
  if (state.phase === "mode" || state.phase === "results") return null;
  const run: ActiveRunStorage["run"] = state.phase === "tournament"
    ? { mode: state.mode, phase: state.phase, draft: publicDraft(state.draft), tournament: { currentStage: state.tournament.currentStage, completedSeries: state.tournament.completedSeries.map(series => ({ stage: series.stage, userWins: series.userWins, opponentWins: series.opponentWins, maps: series.maps.map(map => ({ map: map.map, userScore: map.userScore, opponentScore: map.opponentScore })) })) } }
    : { mode: state.mode, phase: state.phase, draft: publicDraft(state.draft) };
  const parsed = ACTIVE_RECORD.schema.safeParse({ version: 1, run });
  return parsed.success ? structuredClone(parsed.data.run) : null;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validDraft(draft: DraftState, phase: Exclude<GameState["phase"], "mode" | "results" | "tournament"> | "tournament", dataset: GameDataset): boolean {
  const cards = new Map(dataset.cards.map(card => [card.id, card]));
  const teams = new Set(dataset.teams.map(team => team.id));
  const slotEntries = ROLES.flatMap(role => draft.slots[role] ? [[role, draft.slots[role]!] as const] : []);
  const cardIds = slotEntries.map(([, id]) => id);
  if (new Set(cardIds).size !== cardIds.length) return false;
  if (slotEntries.some(([role, id]) => !cards.get(id)?.eligibleRoles.includes(role))) return false;
  if (draft.iglCardId !== null && !cardIds.includes(draft.iglCardId)) return false;
  const usedRerolls = 3 - draft.rerollsRemaining;
  const expectedOfferIndex = slotEntries.length + usedRerolls + (phase === "lineup" || phase === "tournament" ? 0 : 1);
  if (draft.offerIndex !== expectedOfferIndex) return false;
  if (phase === "lineup" || phase === "tournament") {
    const hasFullRoster = ROLES.every(role => Boolean(draft.slots[role]));
    const hasNoOpenDecision = draft.offeredTeamIds.length === 0 && draft.selectedTeamId === null && draft.pendingCardId === null;
    return hasFullRoster && hasNoOpenDecision && (phase === "lineup" || isLineupReady(draft));
  }
  if (draft.offeredTeamIds.length !== 3 || new Set(draft.offeredTeamIds).size !== 3 || draft.offeredTeamIds.some(id => !teams.has(id))) return false;
  const expected = createOffer({ ...draft, offerIndex: draft.offerIndex - 1, offeredTeamIds: [], selectedTeamId: null, pendingCardId: null }, dataset);
  if (!sameIds(draft.offeredTeamIds, expected.offeredTeamIds)) return false;
  if (phase === "team") return draft.selectedTeamId === null && draft.pendingCardId === null && draft.iglCardId === null;
  if (!draft.selectedTeamId || !draft.offeredTeamIds.includes(draft.selectedTeamId)) return false;
  if (phase === "player") return draft.pendingCardId === null && draft.iglCardId === null;
  return draft.pendingCardId !== null && draft.iglCardId === null && selectableCards({ ...draft, pendingCardId: null }, dataset).some(card => card.id === draft.pendingCardId);
}

function sameSummary(actual: SeriesResult, stored: NonNullable<NonNullable<ActiveRunStorage["run"]>["tournament"]>["completedSeries"][number]): boolean {
  return actual.stage === stored.stage && actual.userWins === stored.userWins && actual.opponentWins === stored.opponentWins && actual.maps.length === stored.maps.length && actual.maps.every((map, index) => {
    const expected = stored.maps[index];
    return map.map === expected.map && map.userScore === expected.userScore && map.opponentScore === expected.opponentScore;
  });
}

function significant(highlights: readonly Highlight[]): readonly Highlight[] {
  const seen = new Set<string>();
  return highlights.filter(item => {
    if (seen.has(item.id) || !(item.kind === "clutch" || item.emphasis === "clutch" || item.emphasis === "decisive")) return false;
    seen.add(item.id);
    return true;
  });
}

export async function restoreActiveRun(stored: ActiveRunStorage["run"], dataset: GameDataset, gateway: SimulationGateway): Promise<RestoredActiveRun | null> {
  try {
    const parsed = ACTIVE_RECORD.schema.safeParse({ version: 1, run: stored });
    if (!parsed.success || !parsed.data.run) return null;
    const run = parsed.data.run;
    if (run.mode === "daily") dailyDateFromSeed(run.draft.seed);
    const draft = publicDraft(run.draft);
    if (!validDraft(draft, run.phase, dataset)) return null;
    if (run.phase !== "tournament") {
      if (run.tournament !== undefined) return null;
      return { state: { phase: run.phase, mode: run.mode, draft } as GameState, highlights: [] };
    }
    if (!run.tournament) return null;
    const lineup: Lineup = toLineup(draft);
    let tournament = startTournament(draft.seed, lineup);
    const highlights: Highlight[] = [];
    for (let index = 0; index < run.tournament.completedSeries.length; index += 1) {
      const summary = run.tournament.completedSeries[index];
      if (summary.stage !== STAGE_ORDER[index] || tournament.currentStage !== summary.stage) return null;
      const opponent = gateway.generateOpponent(draft.seed, summary.stage, lineup);
      const generated = await Promise.resolve(gateway.playSeries(draft.seed, summary.stage, lineup, opponent));
      if (!sameSummary(generated, summary) || generated.userWins <= generated.opponentWins) return null;
      if (summary.stage === "semifinal") highlights.push(...significant(gateway.createHighlights(draft.seed, generated, lineup, opponent.lineup)));
      tournament = advanceTournament({ ...tournament, completedSeries: [...tournament.completedSeries, generated] });
    }
    if (tournament.status !== "active" || tournament.currentStage !== run.tournament.currentStage || run.tournament.completedSeries.length !== STAGE_ORDER.indexOf(run.tournament.currentStage)) return null;
    return { state: { phase: "tournament", mode: run.mode, draft, tournament }, highlights };
  } catch {
    return null;
  }
}
