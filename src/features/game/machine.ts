import { assignPendingCard, chooseCard, chooseTeam, createDraft, moveCard, rerollOffer, tagIgl, toLineup, type DraftState } from "./draft";
import type { GameDataset, Role } from "./domain";
import { dailySeed } from "./rng";
import { advanceTournament, startTournament, type SeriesResult, type TournamentState } from "./tournament";

export type GameMode = "daily" | "free-play";
type DraftPhase = "team" | "player" | "role" | "lineup";
type DraftGameState = { phase: DraftPhase; mode: GameMode; draft: DraftState };
export type GameState =
  | { phase: "mode" }
  | DraftGameState
  | { phase: "tournament"; mode: GameMode; draft: DraftState; tournament: TournamentState }
  | { phase: "results"; mode: GameMode; draft: DraftState; tournament: TournamentState };

export type GameAction =
  | { type: "start"; mode: GameMode; seed: string }
  | { type: "reroll" }
  | { type: "choose-team"; teamId: string }
  | { type: "choose-card"; cardId: string }
  | { type: "back-to-teams" }
  | { type: "assign-role"; role: Role }
  | { type: "move-card"; cardId: string; role: Role }
  | { type: "tag-igl"; cardId: string }
  | { type: "enter-tournament" }
  | { type: "resolve-series"; series: SeriesResult }
  | { type: "change-speed"; speed: "normal" | "fast" }
  | { type: "skip-reveal" }
  | { type: "restart" };

export interface GameReducerDependencies { dataset: GameDataset }
export interface GameStartDependencies { now?: () => Date; freeSeedFactory?: () => string }
export const initialGameState: GameState = { phase: "mode" };

export function createStartAction(mode: GameMode, { now = () => new Date(), freeSeedFactory = () => crypto.randomUUID() }: GameStartDependencies = {}): Extract<GameAction, { type: "start" }> {
  return { type: "start", mode, seed: mode === "daily" ? dailySeed(now()) : freeSeedFactory() };
}

function invalid(state: GameState, action: GameAction): never { throw new Error(`Action \"${action.type}\" is not valid during ${state.phase}`); }
function draftState(state: DraftGameState, draft: DraftState, phase: DraftPhase): GameState { return { phase, mode: state.mode, draft }; }

export function createGameReducer({ dataset }: GameReducerDependencies) {
  return (state: GameState, action: GameAction): GameState => {
    if (action.type === "restart") return initialGameState;
    if (action.type === "change-speed" || action.type === "skip-reveal") return state;
    if (action.type === "start") {
      if (state.phase !== "mode") return invalid(state, action);
      return { phase: "team", mode: action.mode, draft: createDraft(action.seed, dataset) };
    }
    switch (state.phase) {
      case "mode": return invalid(state, action);
      case "team":
        if (action.type === "reroll") return draftState(state, rerollOffer(state.draft, dataset), "team");
        if (action.type === "choose-team") return draftState(state, chooseTeam(state.draft, action.teamId), "player");
        return invalid(state, action);
      case "player":
        if (action.type === "back-to-teams") return draftState(state, { ...state.draft, selectedTeamId: null, pendingCardId: null }, "team");
        if (action.type === "choose-card") return draftState(state, chooseCard(state.draft, action.cardId, dataset), "role");
        return invalid(state, action);
      case "role":
        if (action.type !== "assign-role") return invalid(state, action);
        { const draft = assignPendingCard(state.draft, action.role, dataset); return draftState(state, draft, Object.keys(draft.slots).length === 5 ? "lineup" : "team"); }
      case "lineup":
        if (action.type === "move-card") return draftState(state, moveCard(state.draft, action.cardId, action.role, dataset), "lineup");
        if (action.type === "tag-igl") return draftState(state, tagIgl(state.draft, action.cardId), "lineup");
        if (action.type === "enter-tournament") return { phase: "tournament", mode: state.mode, draft: state.draft, tournament: startTournament(state.draft.seed, toLineup(state.draft)) };
        return invalid(state, action);
      case "tournament":
        if (action.type !== "resolve-series") return invalid(state, action);
        { const tournament = advanceTournament({ ...state.tournament, completedSeries: [...state.tournament.completedSeries, action.series] }); return tournament.status === "active" ? { ...state, tournament } : { phase: "results", mode: state.mode, draft: state.draft, tournament }; }
      case "results": return invalid(state, action);
    }
  };
}
