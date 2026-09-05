import { ROLES, type GameDataset, type Role } from "@/features/game/domain";

export type Evidence = {
  cardId: string; year: number; mapsPlayed: number; threshold: number;
  agentClassMaps: Record<Exclude<Role, "flex">, number>;
  finalEligibleRoles: Role[];
  override: { roles: Role[]; sourceIds: string[] } | null;
  sourceIds: string[];
  clutchCoverageMaps: number; clutchWins: number; clutchSourceIds: string[];
};

export function validateChampions(dataset: GameDataset, evidence: Evidence[]): void {
  const errors: string[] = [];
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
    const expectedThreshold = Math.max(2, Math.ceil(card.mapsPlayed * 0.2));
    if (entry.threshold !== expectedThreshold) errors.push(`threshold ${card.id}`);
    for (const role of card.eligibleRoles.filter((role): role is Exclude<Role, "flex"> => role !== "flex")) {
      if (entry.agentClassMaps[role] < expectedThreshold && !(entry.override?.roles.includes(role) && entry.override.sourceIds.every(id => sourceIds.has(id)))) errors.push(`threshold override ${card.id}`);
    }
    if (card.historicalIgl && (!card.sourceIds.includes("riot-vct-2023-awards") || card.traits.leadership <= 50)) errors.push(`IGL evidence ${card.id}`);
    if (!card.historicalIgl && card.traits.leadership !== 50) errors.push(`neutral leadership ${card.id}`);
    if (entry.clutchCoverageMaps < card.mapsPlayed && card.traits.clutch !== 50) errors.push(`clutch coverage ${card.id}`);
    if (!card.sourceIds.length || !entry.sourceIds.length) errors.push(`missing citations ${card.id}`);
  }
  for (const item of [...dataset.teams, ...dataset.players]) {
    const asset = "logo" in item ? item.logo : item.portrait;
    if (asset !== null && !item.sourceIds.some(id => { const source = dataset.sources.find(candidate => candidate.id === id); return source?.usage === "asset" && Boolean(source.credit) && Boolean(source.license); })) errors.push(`asset provenance ${item.id}`);
  }
  if (errors.length) throw new Error(errors.join("; "));
}
