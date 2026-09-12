import { z } from "zod";
import { PORTRAIT_REUSE_BASES, PORTRAIT_SOURCE_KINDS, type PortraitSourceKind, type SourceRef } from "@/features/game/domain";

export const portraitSourceIdPattern = /^(liquipedia|riot-vct)-portrait-(\d+)$/;

export function portraitSourceId(playerId: string, sourceKind: PortraitSourceKind): string {
  const match = /^player-(\d+)$/.exec(playerId);
  if (!match) throw new Error(`invalid portrait player ID ${playerId}`);
  return `${sourceKind === "liquipedia" ? "liquipedia" : "riot-vct"}-portrait-${match[1]}`;
}

export function portraitSourceIdentity(sourceId: string): string | null {
  return portraitSourceIdPattern.exec(sourceId)?.[2] ?? null;
}

const officialPageHosts = ["riotgames.com", "valorantesports.com", "playvalorant.com"];
const mediaHosts = [...officialPageHosts, "riotcdn.net"];
const mediaCdnHosts = ["cmsassets.rgpub.io", "images.contentstack.io", "static.developer.riotgames.com"];
const isHostOrSubdomain = (hostname: string, domains: string[]) => domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
const isHttpsOn = (url: string, matcher: (hostname: string) => boolean) => {
  try { const parsed = new URL(url); return parsed.protocol === "https:" && matcher(parsed.hostname.toLowerCase()); } catch { return false; }
};

export const isApprovedRiotSourcePage = (url: string) => isHttpsOn(url, hostname => isHostOrSubdomain(hostname, officialPageHosts));
export const isApprovedPortraitMediaUrl = (url: string) => isHttpsOn(url, hostname => isHostOrSubdomain(hostname, mediaHosts) || mediaCdnHosts.includes(hostname));

export const portraitSourceMetadataSchema = z.object({
  sourceKind: z.enum(PORTRAIT_SOURCE_KINDS),
  reuseBasis: z.enum(PORTRAIT_REUSE_BASES),
  copyrightOwner: z.string().trim().min(1),
  sourcePublishedAt: z.string().date().optional(),
  event: z.string().trim().min(1).optional(),
  videoUrl: z.string().url().refine(url => new URL(url).protocol === "https:", "HTTPS URL required").optional(),
  videoTimestampSeconds: z.number().nonnegative().optional(),
  permissionUrl: z.string().url().refine(url => new URL(url).protocol === "https:", "HTTPS URL required").optional(),
}).strict();

export type PortraitSourceMetadata = z.infer<typeof portraitSourceMetadataSchema>;

export function validatePortraitSourceMetadata(source: SourceRef): PortraitSourceMetadata {
  const parsed = portraitSourceMetadataSchema.safeParse({
    sourceKind: source.sourceKind,
    reuseBasis: source.reuseBasis,
    copyrightOwner: source.copyrightOwner,
    sourcePublishedAt: source.sourcePublishedAt,
    event: source.event,
    videoUrl: source.videoUrl,
    videoTimestampSeconds: source.videoTimestampSeconds,
    permissionUrl: source.permissionUrl,
  });
  if (!parsed.success) throw new Error(`structured portrait provenance ${source.id}`);
  const metadata = parsed.data;
  const namespace = metadata.sourceKind === "liquipedia" ? "liquipedia" : "riot-vct";
  if (portraitSourceIdPattern.exec(source.id)?.[1] !== namespace) throw new Error(`portrait source namespace ${source.id}`);
  const hasVideo = metadata.videoUrl !== undefined || metadata.videoTimestampSeconds !== undefined;
  if (metadata.sourceKind === "vct-broadcast-frame" ? !metadata.videoUrl || metadata.videoTimestampSeconds === undefined : hasVideo) {
    throw new Error(`structured portrait provenance ${source.id}`);
  }
  return metadata;
}
