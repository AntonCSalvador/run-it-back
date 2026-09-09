import { z } from "zod";
import type { PlayerIdentity, SourceRef } from "@/features/game/domain";
import { sourceRefSchema } from "@/features/game/schema";

const portraitAssetSchema = z.object({
  playerId: z.string().regex(/^player-\d+$/),
  portrait: z.string().regex(/^\/assets\/players\/player-\d+\.[a-f0-9]{12}\.webp$/),
  sourceId: z.string().regex(/^liquipedia-portrait-\d+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const portraitAssetsSchema = z.array(portraitAssetSchema);
export type PortraitAsset = z.infer<typeof portraitAssetSchema>;

const portraitPath = /^\/assets\/players\/player-(\d+)\.[a-f0-9]{12}\.webp$/;
const playerId = /^player-(\d+)$/;
const portraitSourceId = /^liquipedia-portrait-(\d+)$/;

function schemaError(input: unknown): never {
  const parsed = portraitAssetsSchema.safeParse(input);
  if (parsed.success) throw new Error("Expected an invalid portrait catalog");
  throw new Error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
}

export function parsePortraitCatalog(input: unknown): PortraitAsset[] {
  if (Array.isArray(input)) {
    for (const row of input) {
      if (row && typeof row === "object" && "portrait" in row && typeof row.portrait === "string" && !portraitPath.test(row.portrait)) {
        throw new Error(`local asset path required for portrait ${row.portrait}`);
      }
    }
  }
  const parsed = portraitAssetsSchema.safeParse(input);
  if (!parsed.success) return schemaError(input);
  return parsed.data;
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label} ${value}`);
    seen.add(value);
  }
}

function parseSources(input: unknown): SourceRef[] {
  const parsed = z.array(sourceRefSchema).safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  return parsed.data;
}

function isLiquipediaCommonsDescription(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.hostname === "liquipedia.net" && parsed.pathname.startsWith("/commons/File:");
}

function isHttps(url: string | undefined): url is string {
  return typeof url === "string" && new URL(url).protocol === "https:";
}

export function validatePortraitCatalog(players: readonly PlayerIdentity[], input: unknown, sourceInput: unknown): void {
  const knownPlayers = new Set(players.map(player => player.id));
  if (Array.isArray(input)) {
    for (const row of input) {
      if (row && typeof row === "object" && "playerId" in row && typeof row.playerId === "string" && !knownPlayers.has(row.playerId)) {
        throw new Error(`orphan player ${row.playerId}`);
      }
    }
  }
  const assets = parsePortraitCatalog(input);
  const sources = parseSources(sourceInput);
  assertUnique(assets.map(asset => asset.playerId), "player");
  assertUnique(assets.map(asset => asset.portrait), "portrait path");
  assertUnique(assets.map(asset => asset.sourceId), "portrait source ID");

  const assetSources = sources.filter(source => source.usage === "asset");
  assertUnique(assetSources.map(source => source.id), "portrait source");
  const sourcesById = new Map(assetSources.map(source => [source.id, source]));

  for (const asset of assets) {
    if (!knownPlayers.has(asset.playerId)) throw new Error(`orphan player ${asset.playerId}`);
    const identity = [playerId.exec(asset.playerId)?.[1], portraitPath.exec(asset.portrait)?.[1], portraitSourceId.exec(asset.sourceId)?.[1]];
    if (identity.some(value => value !== identity[0])) throw new Error(`portrait identity mismatch ${asset.playerId}`);
    const source = sourcesById.get(asset.sourceId);
    if (!source) throw new Error(`portrait source missing ${asset.sourceId}`);
    if (!isLiquipediaCommonsDescription(source.url)) throw new Error(`portrait source must be an HTTPS Liquipedia Commons description URL ${asset.sourceId}`);
    if (!isHttps(source.originalUrl)) throw new Error(`portrait source originalUrl must be HTTPS ${asset.sourceId}`);
    if (!source.credit?.trim()) throw new Error(`portrait source credit is required ${asset.sourceId}`);
    if (!source.license?.trim()) throw new Error(`portrait source license is required ${asset.sourceId}`);
  }

  for (const source of assetSources) {
    if (!portraitSourceId.test(source.id)) throw new Error(`portrait asset source ID ${source.id}`);
    if (!assets.some(asset => asset.sourceId === source.id)) throw new Error(`unused portrait source ${source.id}`);
  }
}

export function applyPortraitCatalog(players: readonly PlayerIdentity[], assets: readonly PortraitAsset[]): PlayerIdentity[] {
  const byPlayerId = new Map(assets.map(asset => [asset.playerId, asset]));
  return players.map(player => {
    const asset = byPlayerId.get(player.id);
    if (!asset) return { ...player, sourceIds: [...player.sourceIds] };
    return {
      ...player,
      portrait: asset.portrait,
      sourceIds: player.sourceIds.includes(asset.sourceId) ? [...player.sourceIds] : [...player.sourceIds, asset.sourceId],
    };
  });
}
