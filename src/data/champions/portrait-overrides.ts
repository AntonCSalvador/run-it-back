import { z } from "zod";
import {
  PORTRAIT_REUSE_BASES,
  PORTRAIT_SOURCE_KINDS,
  type PlayerIdentity,
} from "@/features/game/domain";
import {
  isApprovedOpenPortraitLicense,
  isRiotGamesCopyrightOwner,
} from "./portrait-policy";
import {
  isApprovedPortraitMediaUrl,
  isApprovedRiotSourcePage,
} from "./portrait-source";

export interface CropFocus {
  x: number;
  y: number;
}

interface PortraitOverrideBase {
  playerId: string;
  sourceKind: (typeof PORTRAIT_SOURCE_KINDS)[number];
  sourcePage: string;
  credit: string;
  copyrightOwner: string;
  reuseBasis: (typeof PORTRAIT_REUSE_BASES)[number];
  license: string;
  permissionUrl?: string;
  identityConfirmed: true;
  cropFocus: CropFocus;
}

export interface PortraitStillOverride extends PortraitOverrideBase {
  sourceKind: Exclude<(typeof PORTRAIT_SOURCE_KINDS)[number], "vct-broadcast-frame">;
  mediaUrl: string;
}

export interface PortraitFrameOverride extends PortraitOverrideBase {
  sourceKind: "vct-broadcast-frame";
  videoUrl: string;
  videoTimestampSeconds: number;
  capturePath: string;
}

export type PortraitOverride = PortraitStillOverride | PortraitFrameOverride;

const httpsUrl = z.url().refine(
  (value) => new URL(value).protocol === "https:",
  "HTTPS URL required",
);
const reviewedBaseSchema = z.object({
  playerId: z.string().regex(/^player-\d+$/),
  sourceKind: z.enum(PORTRAIT_SOURCE_KINDS),
  sourcePage: httpsUrl.refine(isApprovedRiotSourcePage, "approved Riot source page required"),
  credit: z.string().trim().min(1),
  copyrightOwner: z.string().trim().min(1),
  reuseBasis: z.enum(PORTRAIT_REUSE_BASES),
  license: z.string().trim().min(1),
  permissionUrl: httpsUrl.optional(),
  identityConfirmed: z.literal(true, "identity confirmation required"),
  cropFocus: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).strict(),
}).strict();

const stillOverrideSchema = reviewedBaseSchema.extend({
  sourceKind: z.enum(PORTRAIT_SOURCE_KINDS.filter(kind => kind !== "vct-broadcast-frame")),
  mediaUrl: httpsUrl.refine(isApprovedPortraitMediaUrl, "approved portrait media URL required"),
}).strict();

const frameOverrideSchema = reviewedBaseSchema.extend({
  sourceKind: z.literal("vct-broadcast-frame"),
  videoUrl: httpsUrl,
  videoTimestampSeconds: z.number().nonnegative(),
  capturePath: z.string().regex(
    /^assets\/portrait-sources\/player-\d+\.(?:png|jpg|jpeg|webp)$/,
    "capture path must be a player portrait asset",
  ),
}).strict();

const portraitOverrideSchema = z.discriminatedUnion("sourceKind", [
  stillOverrideSchema,
  frameOverrideSchema,
]);

const isRiotLicense = (license: string) => /riot.*(?:legal|fan[ -]?policy|terms)/i.test(license);

function validateReuse(row: PortraitOverride): void {
  if (row.reuseBasis === "riot-fan-policy") {
    if (!isRiotGamesCopyrightOwner(row.copyrightOwner)) {
      throw new Error(`Riot ownership required for ${row.playerId}`);
    }
    if (!isRiotLicense(row.license)) {
      throw new Error(`Riot Legal license required for ${row.playerId}`);
    }
  }

  if (row.reuseBasis === "open-license" && !isApprovedOpenPortraitLicense(row.license)) {
    throw new Error(`approved open-license marker required for ${row.playerId}`);
  }

  if (row.reuseBasis === "explicit-permission") {
    if (row.license !== "permission" || !row.permissionUrl) {
      throw new Error(`explicit permission requires permission license and URL for ${row.playerId}`);
    }
  }
}

export function parsePortraitOverrides(
  input: unknown,
  players: readonly Pick<PlayerIdentity, "id" | "canonicalHandle">[],
): PortraitOverride[] {
  const parsed = z.array(portraitOverrideSchema).parse(input) as PortraitOverride[];
  const playerIds = new Set(players.map(player => player.id));
  const seen = new Set<string>();

  for (const row of parsed) {
    if (!playerIds.has(row.playerId)) throw new Error(`unknown player ${row.playerId}`);
    if (seen.has(row.playerId)) throw new Error(`duplicate player ${row.playerId}`);
    seen.add(row.playerId);
    if (row.sourceKind === "vct-broadcast-frame") {
      const expectedPath = new RegExp(`^assets/portrait-sources/${row.playerId}\\.(?:png|jpg|jpeg|webp)$`);
      if (!expectedPath.test(row.capturePath)) throw new Error(`capture path must match ${row.playerId}`);
    }
    validateReuse(row);
  }

  return parsed;
}
