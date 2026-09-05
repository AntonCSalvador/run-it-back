import { z } from "zod";
import type { GameDataset } from "./domain";

const id = z.string().min(1);
const year = z.union([z.literal(2021), z.literal(2022), z.literal(2023), z.literal(2024), z.literal(2025)]);
const sourceIds = z.array(id);
export const traitsSchema = z.object({ firepower: z.number().min(0).max(100), utility: z.number().min(0).max(100), survival: z.number().min(0).max(100), clutch: z.number().min(0).max(100), consistency: z.number().min(0).max(100), leadership: z.number().min(0).max(100) });
export const sourceRefSchema = z.object({ id, url: z.string().url(), retrievedAt: z.string().date(), usage: z.enum(["facts", "asset"]), credit: z.string().optional(), license: z.string().optional() });
export const teamAppearanceSchema = z.object({ id, name: z.string().min(1), shortName: z.string().min(1), year, logo: z.string().nullable(), sourceIds });
export const playerIdentitySchema = z.object({ id, canonicalHandle: z.string().min(1), portrait: z.string().nullable(), sourceIds });
export const playerCardSchema = z.object({ id, playerId: id, teamId: id, year, displayHandle: z.string().min(1), mapsPlayed: z.number().int().positive(), eligibleRoles: z.array(z.enum(["smokes", "duelist", "initiator", "sentinel", "flex"])).min(1), historicalIgl: z.boolean(), traits: traitsSchema, sourceIds });
export const gameDatasetSchema = z.object({ version: z.number().int().positive(), sources: z.array(sourceRefSchema), teams: z.array(teamAppearanceSchema), players: z.array(playerIdentitySchema), cards: z.array(playerCardSchema) });

function duplicateErrors(items: Array<{ id: string }>, collection: string): string[] {
  const seen = new Set<string>(); const errors: string[] = [];
  for (const item of items) { if (seen.has(item.id)) errors.push(`duplicate ${collection} id "${item.id}"`); seen.add(item.id); }
  return errors;
}

export function parseDataset(input: unknown): GameDataset {
  const parsed = gameDatasetSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  const data = parsed.data;
  const errors = [
    ...duplicateErrors(data.sources, "sources"), ...duplicateErrors(data.teams, "teams"),
    ...duplicateErrors(data.players, "players"), ...duplicateErrors(data.cards, "cards")
  ];
  const sourceSet = new Set(data.sources.map(s => s.id));
  const playerSet = new Set(data.players.map(p => p.id)); const teamSet = new Set(data.teams.map(t => t.id));
  const checkSources = (owner: string, refs: string[]) => refs.forEach(ref => { if (!sourceSet.has(ref)) errors.push(`${owner} references missing source ID "${ref}"`); });
  data.teams.forEach(team => checkSources(`team ${team.id}`, team.sourceIds));
  data.players.forEach(player => checkSources(`player ${player.id}`, player.sourceIds));
  data.cards.forEach(card => {
    checkSources(`card ${card.id}`, card.sourceIds);
    if (!playerSet.has(card.playerId)) errors.push(`card ${card.id} references missing player ID "${card.playerId}"`);
    if (!teamSet.has(card.teamId)) errors.push(`card ${card.id} references missing team ID "${card.teamId}"`);
    const team = data.teams.find(candidate => candidate.id === card.teamId);
    if (team && team.year !== card.year) errors.push(`card ${card.id} year ${card.year} does not match team ${team.id} year ${team.year}`);
  });
  if (errors.length) throw new Error(errors.join("; "));
  return data as GameDataset;
}
