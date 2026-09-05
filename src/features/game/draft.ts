import { scopedRng } from "./rng";
import { ROLES, type GameDataset, type Lineup, type PlayerCard, type Role } from "./domain";

export interface DraftState { seed: string; offerIndex: number; rerollsRemaining: number; offeredTeamIds: string[]; selectedTeamId: string | null; pendingCardId: string | null; slots: Partial<Record<Role, string>>; iglCardId: string | null }

const drafted = (state: DraftState) => new Set(Object.values(state.slots).filter((id): id is string => Boolean(id)));
const eligible = (card: PlayerCard, state: DraftState) => !drafted(state).has(card.id) && card.eligibleRoles.some(role => !state.slots[role]);

export function createOffer(state: DraftState, dataset: GameDataset): DraftState {
  const candidates = dataset.teams.filter(team => dataset.cards.some(card => card.teamId === team.id && eligible(card, state)));
  if (candidates.length < 3) throw new Error(`Unable to create offer: only ${candidates.length} eligible teams remain`);
  const rng = scopedRng(state.seed, `offer:${state.offerIndex}`);
  const offeredTeamIds = rng.shuffle(candidates.map(team => team.id)).slice(0, 3);
  return { ...state, offerIndex: state.offerIndex + 1, offeredTeamIds };
}

export function createDraft(seed: string, dataset: GameDataset): DraftState {
  return createOffer({ seed, offerIndex: 0, rerollsRemaining: 3, offeredTeamIds: [], selectedTeamId: null, pendingCardId: null, slots: {}, iglCardId: null }, dataset);
}

export function rerollOffer(state: DraftState, dataset: GameDataset): DraftState {
  if (state.rerollsRemaining <= 0) throw new Error("No rerolls remaining");
  const next = createOffer({ ...state, rerollsRemaining: state.rerollsRemaining - 1 }, dataset);
  if (next.offeredTeamIds.every(id => state.offeredTeamIds.includes(id))) {
    const alternatives = dataset.teams.filter(team => !state.offeredTeamIds.includes(team.id) && dataset.cards.some(card => card.teamId === team.id && eligible(card, state)));
    if (alternatives.length) return { ...next, offeredTeamIds: [alternatives[0].id, ...next.offeredTeamIds.slice(0, 2)] };
  }
  return next;
}

export function chooseTeam(state: DraftState, teamId: string): DraftState {
  if (!state.offeredTeamIds.includes(teamId)) throw new Error("Team is not currently offered");
  return { ...state, selectedTeamId: teamId, pendingCardId: null };
}

export function selectableCards(state: DraftState, dataset: GameDataset): PlayerCard[] {
  if (!state.selectedTeamId) return [];
  return dataset.cards.filter(card => card.teamId === state.selectedTeamId && eligible(card, state));
}

export function chooseCard(state: DraftState, cardId: string, dataset: GameDataset): DraftState {
  if (!selectableCards(state, dataset).some(card => card.id === cardId)) throw new Error("Card is not selectable");
  return { ...state, pendingCardId: cardId };
}

export function assignPendingCard(state: DraftState, role: Role, dataset: GameDataset): DraftState {
  if (!state.pendingCardId) throw new Error("No pending card");
  if (state.slots[role]) throw new Error("Role is already occupied");
  const card = dataset.cards.find(candidate => candidate.id === state.pendingCardId);
  if (!card || !card.eligibleRoles.includes(role) || drafted(state).has(card.id)) throw new Error("Card cannot fill this role");
  const next = { ...state, slots: { ...state.slots, [role]: card.id }, pendingCardId: null, selectedTeamId: null, offeredTeamIds: [] };
  return drafted(next).size < ROLES.length ? createOffer(next, dataset) : next;
}

export function moveCard(state: DraftState, cardId: string, role: Role, dataset: GameDataset): DraftState {
  const source = ROLES.find(candidate => state.slots[candidate] === cardId);
  if (!source) throw new Error("Card is not drafted");
  const card = dataset.cards.find(candidate => candidate.id === cardId);
  if (!card || !card.eligibleRoles.includes(role)) throw new Error("Card cannot fill this role");
  const occupant = state.slots[role];
  if (occupant) {
    const displaced = dataset.cards.find(candidate => candidate.id === occupant);
    if (!displaced || !displaced.eligibleRoles.includes(source)) throw new Error("Occupied role cannot be swapped");
  }
  const slots = { ...state.slots, [source]: occupant, [role]: cardId };
  return { ...state, slots };
}

export function tagIgl(state: DraftState, cardId: string): DraftState {
  if (!drafted(state).has(cardId)) throw new Error("Card is not drafted");
  return { ...state, iglCardId: cardId };
}

export function isLineupReady(state: DraftState): boolean { return ROLES.every(role => Boolean(state.slots[role])) && Boolean(state.iglCardId) && drafted(state).has(state.iglCardId!); }
export function toLineup(state: DraftState): Lineup {
  if (!isLineupReady(state)) throw new Error("Lineup is not ready");
  return { slots: ROLES.map(role => ({ role, cardId: state.slots[role]! })), iglCardId: state.iglCardId! };
}
