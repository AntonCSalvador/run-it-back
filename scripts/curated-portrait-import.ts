import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePortraitOverrides, type PortraitOverride } from "../src/data/champions/portrait-overrides";
import { portraitSourceId } from "../src/data/champions/portrait-source";
import { convertPortrait, loadPortraitCapture, loadRemotePortrait } from "./portrait-media";
import type { GeneratedPortrait, ImportPlayer } from "./portrait-import";

export class CuratedPortraitConversionError extends Error {}

export async function discoverCuratedPortrait(player: ImportPlayer, override: PortraitOverride, root: string, stageDir: string, fetch: typeof globalThis.fetch, retrievalDate: string): Promise<GeneratedPortrait> {
  parsePortraitOverrides([override], [player]);
  const bytes = override.sourceKind === "vct-broadcast-frame"
    ? loadPortraitCapture(root, override.capturePath)
    : await loadRemotePortrait(override.mediaUrl, fetch);
  let webp: Buffer;
  try { webp = await convertPortrait(bytes, override.cropFocus); }
  catch (error) { throw new CuratedPortraitConversionError("curated portrait conversion failed", { cause: error }); }
  const sha256 = createHash("sha256").update(webp).digest("hex");
  const filename = `${player.id}.${sha256.slice(0, 12)}.webp`;
  mkdirSync(stageDir, { recursive: true });
  writeFileSync(join(stageDir, filename), webp);
  const sourceId = portraitSourceId(player.id, override.sourceKind);
  return { playerId: player.id, portrait: `/assets/players/${filename}`, sourceId, sha256, source: {
    id: sourceId, url: override.sourcePageUrl,
    originalUrl: override.sourceKind === "vct-broadcast-frame" ? override.sourcePageUrl : override.mediaUrl,
    retrievedAt: retrievalDate, usage: "asset", credit: override.credit, license: override.license,
    sourceKind: override.sourceKind, reuseBasis: override.reuseBasis, copyrightOwner: override.copyrightOwner,
    ...(override.event !== undefined ? { event: override.event } : {}),
    ...(override.sourcePublishedAt !== undefined ? { sourcePublishedAt: override.sourcePublishedAt } : {}),
    ...(override.permissionUrl !== undefined ? { permissionUrl: override.permissionUrl } : {}),
    ...(override.sourceKind === "vct-broadcast-frame" ? { videoUrl: override.videoUrl, videoTimestampSeconds: override.videoTimestampSeconds } : {}),
  } };
}
