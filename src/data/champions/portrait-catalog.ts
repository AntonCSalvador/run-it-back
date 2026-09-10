import { z } from "zod";
import type { PlayerIdentity, SourceRef } from "@/features/game/domain";
import { sourceRefSchema } from "@/features/game/schema";
import { hasRiotGamesCopyrightCredit, isApprovedOpenPortraitLicense, isApprovedRiotPortraitOriginalUrl, isRiotGamesCopyrightOwner } from "./portrait-policy";
import { isApprovedPortraitMediaUrl, isApprovedRiotSourcePage, portraitSourceIdPattern, portraitSourceIdentity, validatePortraitSourceMetadata } from "./portrait-source";

const portraitPath = /^\/assets\/players\/player-(\d+)\.[a-f0-9]{12}\.webp$/;
const playerId = /^player-(\d+)$/;

const portraitAssetSchema = z.object({
  playerId: z.string().regex(/^player-\d+$/),
  portrait: z.string().regex(/^\/assets\/players\/player-\d+\.[a-f0-9]{12}\.webp$/),
  sourceId: z.string().regex(portraitSourceIdPattern),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((asset, context) => {
  const identity = [playerId.exec(asset.playerId)?.[1], portraitPath.exec(asset.portrait)?.[1], portraitSourceIdentity(asset.sourceId)];
  if (identity.some(value => value !== identity[0])) context.addIssue({ code: "custom", message: "portrait identity mismatch" });
});

export const portraitAssetsSchema = z.array(portraitAssetSchema);
export type PortraitAsset = z.infer<typeof portraitAssetSchema>;

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

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function localCalendarDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

type PortraitCatalogValidationOptions = { requireOverlay?: boolean; today?: string; now?: () => Date; validateFutureDates?: boolean };

export function validatePortraitCatalog(players: readonly PlayerIdentity[], input: unknown, sourceInput: unknown, options: PortraitCatalogValidationOptions = {}): void {
  const today = options.today ?? localCalendarDate(options.now ? options.now() : new Date());
  if (!isCalendarDate(today)) throw new Error(`invalid portrait validation date ${today}`);
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

  const portraitSources = sources.filter(source => portraitSourceIdPattern.test(source.id));
  assertUnique(portraitSources.map(source => source.id), "portrait source");
  for (const source of portraitSources) {
    if (source.usage !== "asset") throw new Error(`portrait source usage asset required ${source.id}`);
    if (!isCalendarDate(source.retrievedAt)) throw new Error(`portrait source retrieval date is invalid ${source.id}`);
    if (options.validateFutureDates !== false && source.retrievedAt > today) throw new Error(`future retrieval date ${source.id}`);
    validatePortraitSourceMetadata(source);
  }
  const sourcesById = new Map(portraitSources.map(source => [source.id, source]));

  for (const asset of assets) {
    if (!knownPlayers.has(asset.playerId)) throw new Error(`orphan player ${asset.playerId}`);
    const identity = [playerId.exec(asset.playerId)?.[1], portraitPath.exec(asset.portrait)?.[1], portraitSourceIdentity(asset.sourceId)];
    if (identity.some(value => value !== identity[0])) throw new Error(`portrait identity mismatch ${asset.playerId}`);
    const source = sourcesById.get(asset.sourceId);
    if (!source) throw new Error(`portrait source missing ${asset.sourceId}`);
    const metadata = validatePortraitSourceMetadata(source);
    if (metadata.sourceKind === "liquipedia" && !isLiquipediaCommonsDescription(source.url)) throw new Error(`portrait source must be an HTTPS Liquipedia Commons description URL ${asset.sourceId}`);
    if (metadata.sourceKind !== "liquipedia" && !isApprovedRiotSourcePage(source.url)) throw new Error(`portrait source must be an approved official source page ${asset.sourceId}`);
    if (!isHttps(source.originalUrl)) throw new Error(`portrait source originalUrl must be HTTPS ${asset.sourceId}`);
    if (metadata.sourceKind !== "liquipedia" && !isApprovedPortraitMediaUrl(source.originalUrl)) throw new Error(`portrait source originalUrl must be approved ${asset.sourceId}`);
    if (!source.credit?.trim()) throw new Error(`portrait source credit is required ${asset.sourceId}`);
    if (!source.license?.trim()) throw new Error(`portrait source license is required ${asset.sourceId}`);
    const approvedLiquipediaRiotPolicy = metadata.sourceKind === "liquipedia"
      && metadata.reuseBasis === "riot-fan-policy"
      && source.license.trim().toLowerCase() === "permission"
      && hasRiotGamesCopyrightCredit(source.credit)
      && isApprovedRiotPortraitOriginalUrl(source.originalUrl);
    if ((metadata.reuseBasis === "riot-fan-policy" && !isRiotGamesCopyrightOwner(metadata.copyrightOwner)) || (metadata.sourceKind !== "liquipedia" && (!isRiotGamesCopyrightOwner(metadata.copyrightOwner) || !isApprovedRiotSourcePage(source.url) || !isApprovedPortraitMediaUrl(source.originalUrl)))) throw new Error(`portrait source reuse grounds are not approved ${asset.sourceId}`);
    const approvedReuse = metadata.reuseBasis === "open-license"
      ? isApprovedOpenPortraitLicense(source.license)
      : metadata.reuseBasis === "riot-fan-policy"
        ? metadata.sourceKind === "liquipedia" ? approvedLiquipediaRiotPolicy : isRiotGamesCopyrightOwner(metadata.copyrightOwner)
        : source.license.trim().toLowerCase() === "permission" && metadata.permissionUrl !== undefined && (metadata.sourceKind === "liquipedia" || isApprovedRiotSourcePage(metadata.permissionUrl));
    if (!approvedReuse) throw new Error(`portrait source reuse grounds are not approved ${asset.sourceId}`);
  }

  for (const source of sources) {
    if (source.usage === "asset" && !portraitSourceIdPattern.test(source.id)) throw new Error(`portrait asset source ID ${source.id}`);
    if (!portraitSourceIdPattern.test(source.id)) continue;
    if (!assets.some(asset => asset.sourceId === source.id)) throw new Error(`unused portrait source ${source.id}`);
  }

  if (options.requireOverlay) {
    const assetsByPlayerId = new Map(assets.map(asset => [asset.playerId, asset]));
    for (const player of players) {
      const asset = assetsByPlayerId.get(player.id);
      const portraitSourceIds = player.sourceIds.filter(sourceId => portraitSourceIdPattern.test(sourceId));
      if (!asset) {
        if (player.portrait !== null) throw new Error(`portrait overlay missing for ${player.id}`);
        if (portraitSourceIds.length) throw new Error(`portrait source overlay missing for ${player.id}`);
        continue;
      }
      if (player.portrait !== asset.portrait) throw new Error(`portrait overlay mismatch for ${player.id}`);
      if (portraitSourceIds.length !== 1 || portraitSourceIds[0] !== asset.sourceId) throw new Error(`portrait source overlay mismatch for ${player.id}`);
    }
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
