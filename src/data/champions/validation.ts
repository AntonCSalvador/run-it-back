import { ROLES, type GameDataset, type Role } from "@/features/game/domain";
import { createHash } from "node:crypto";
import rawData from "./raw-extraction.json";
import reviewedOverlays from "./reviewed-overlays.json";
import { deriveChampions, type Overlays, type RawExtraction } from "./derivation";

export type Evidence = {
  cardId: string; year: number; mapsPlayed: number; threshold: number;
  agentClassMaps: Record<Exclude<Role, "flex">, number>;
  suggestedRoles: Role[];
  finalEligibleRoles: Role[];
  override: { roles: Role[]; reason: string; sourceIds: string[] } | null;
  sourceIds: string[];
  clutchCoverageMaps: number; clutchWins: number; clutchSourceIds: string[];
  performanceAvailableMaps: number;
};

export function validateChampions(dataset: GameDataset, evidence: Evidence[]): void {
  const errors: string[] = [];
  if (createHash("sha256").update(JSON.stringify(rawData)).digest("hex") !== "25d688e794e3031b019fa0341653d410afda6da90cbb5cd387e7d9986673c546") throw new Error("raw extraction checksum mismatch");
  if (createHash("sha256").update(JSON.stringify(reviewedOverlays)).digest("hex") !== "960a351382216a2359087835c53c4d506406134b6b42bc815e17f5a3288b1369") throw new Error("reviewed overlays checksum mismatch");
  const derived = deriveChampions(rawData as RawExtraction, reviewedOverlays as Overlays);
  const expectedCards = new Map(derived.map(card => [card.id, card]));
  if (dataset.cards.length !== 404 || new Set(dataset.cards.map(card => card.id)).size !== 404 || dataset.players.length !== 239 || new Set(dataset.players.map(player => player.id)).size !== 239) errors.push("raw participation cardinality");
  const playerIds = new Set(rawData.cards.map(card => `player-${card.playerId}`));
  if (dataset.players.some(player => !playerIds.has(player.id))) errors.push("raw player identity");
  if (dataset.teams.length !== reviewedOverlays.teams.length || new Set(dataset.teams.map(team => team.id)).size !== 80) errors.push("raw teams");
  for (const expected of reviewedOverlays.teams) {
    const team = dataset.teams.find(team => team.id === expected.id);
    if (!team || team.year !== expected.year || team.name !== expected.name || team.shortName !== expected.shortName) errors.push(`reviewed team mapping ${expected.id}`);
  }
  const sourceIds = new Set(dataset.sources.map(source => source.id));
  for (const year of [2021, 2022, 2023, 2024, 2025]) {
    if (dataset.teams.filter(team => team.year === year).length !== 16) errors.push(`year ${year} team count`);
    if (!ROLES.every(role => dataset.cards.some(card => card.year === year && card.eligibleRoles.includes(role)))) errors.push(`year ${year} roles`);
  }
  if (new Set(evidence.map(entry => entry.cardId)).size !== evidence.length || evidence.length !== dataset.cards.length) errors.push("evidence must cover every card exactly once");
  const byCard = new Map(evidence.map(entry => [entry.cardId, entry]));
  for (const card of dataset.cards) {
    const entry = byCard.get(card.id);
    if (!entry || entry.mapsPlayed !== card.mapsPlayed || entry.year !== card.year) { errors.push(`evidence mismatch ${card.id}`); continue; }
    const expected = expectedCards.get(card.id);
    if (!expected) { errors.push(`raw participation ${card.id}`); continue; }
    for (const key of ["playerId", "teamId", "year", "displayHandle", "mapsPlayed", "historicalIgl"] as const) if (card[key] !== expected[key]) errors.push(`raw ${key} ${card.id}`);
    for (const trait of ["firepower", "utility", "survival", "clutch", "consistency", "leadership"] as const) if (card.traits[trait] !== expected.traits[trait]) errors.push(`derived trait ${trait} ${card.id}`);
    if (entry.clutchWins !== expected.clutchWins || entry.clutchCoverageMaps !== expected.performanceAvailableMaps || entry.performanceAvailableMaps !== expected.performanceAvailableMaps) errors.push(`raw clutch/coverage ${card.id}`);
    if (Object.entries(expected.agentClassMaps).some(([role, count]) => entry.agentClassMaps[role as Exclude<Role, "flex">] !== count)) errors.push(`raw class counts ${card.id}`);
    if (card.eligibleRoles.join() !== expected.eligibleRoles.join()) errors.push(`derived final roles ${card.id}`);
    if (JSON.stringify(entry.override) !== JSON.stringify(expected.override)) errors.push(`reviewed threshold override ${card.id}`);
    if (entry.override && (!entry.override.reason.trim() || !entry.override.sourceIds.length || !entry.override.sourceIds.every(id => sourceIds.has(id)) || entry.override.roles.join() === entry.suggestedRoles.join())) errors.push(`invalid threshold override ${card.id}`);
    const expectedThreshold = Math.max(2, Math.ceil(card.mapsPlayed * 0.2));
    if (entry.threshold !== expectedThreshold) errors.push(`threshold ${card.id}`);
    const classes = Object.values(entry.agentClassMaps);
    if (classes.some(value => !Number.isInteger(value) || value < 0) || classes.reduce((sum, value) => sum + value, 0) !== card.mapsPlayed) errors.push(`class counts ${card.id}`);
    const suggested = (Object.entries(entry.agentClassMaps).filter(([, value]) => value >= expectedThreshold).map(([role]) => role) as Role[]);
    if (suggested.length >= 2) suggested.push("flex");
    if (suggested.join(",") !== entry.suggestedRoles.join(",")) errors.push(`suggested roles ${card.id}`);
    if (entry.finalEligibleRoles.join(",") !== card.eligibleRoles.join(",")) errors.push(`final roles ${card.id}`);
    if (card.eligibleRoles.includes("flex") !== suggested.includes("flex")) errors.push(`flex ${card.id}`);
    if (!entry.sourceIds.length || !entry.sourceIds.every(id => sourceIds.has(id))) errors.push(`evidence sources ${card.id}`);
    for (const role of card.eligibleRoles.filter((role): role is Exclude<Role, "flex"> => role !== "flex")) {
      if (entry.agentClassMaps[role] < expectedThreshold && !(entry.override?.roles.includes(role) && entry.override.reason.trim().length > 0 && entry.override.sourceIds.length > 0 && entry.override.sourceIds.every(id => sourceIds.has(id)))) errors.push(`threshold override ${card.id}`);
    }
    if (card.historicalIgl && (!card.sourceIds.includes("riot-vct-2023-awards") || !entry.sourceIds.includes("riot-vct-2023-awards") || card.traits.leadership !== 75)) errors.push(`IGL evidence ${card.id}`);
    if (!card.historicalIgl && card.traits.leadership !== 50) errors.push(`neutral leadership ${card.id}`);
    if (!Number.isInteger(entry.clutchCoverageMaps) || entry.clutchCoverageMaps < 0 || entry.clutchCoverageMaps > card.mapsPlayed || !Number.isInteger(entry.clutchWins) || entry.clutchWins < 0 || entry.clutchWins > entry.clutchCoverageMaps * 5 || !entry.clutchSourceIds.length || !entry.clutchSourceIds.every(id => sourceIds.has(id))) errors.push(`clutch evidence ${card.id}`);
    if (entry.clutchCoverageMaps < card.mapsPlayed && card.traits.clutch !== 50) errors.push(`clutch coverage ${card.id}`);
    if (!card.sourceIds.length || !entry.sourceIds.length) errors.push(`missing citations ${card.id}`);
  }
  for (const item of [...dataset.teams, ...dataset.players]) {
    if (!item.sourceIds.length || !item.sourceIds.every(id => sourceIds.has(id))) errors.push(`missing citations ${item.id}`);
    const asset = "logo" in item ? item.logo : item.portrait;
    if (asset !== null && !item.sourceIds.some(id => { const source = dataset.sources.find(candidate => candidate.id === id); return source?.usage === "asset" && Boolean(source.credit) && Boolean(source.license); })) errors.push(`asset provenance ${item.id}`);
  }
  if (errors.length) throw new Error(errors.join("; "));
}
