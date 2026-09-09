import { z } from "zod";
import { ROLES, type PlayerCard, type Role, type Traits } from "@/features/game/domain";

const integerTrait = z.number().finite().int().min(0).max(100);

export const manualTraitsSchema = z.object({
  leadership: integerTrait,
  firepower: integerTrait,
  utility: integerTrait,
  survival: integerTrait,
  clutch: integerTrait,
  consistency: integerTrait,
}).strict();

export const manualEligibleRolesSchema = z.array(z.enum(ROLES)).min(1).superRefine((roles, context) => {
  if (new Set(roles).size !== roles.length) {
    context.addIssue({ code: "custom", message: "roles must be distinct" });
  }
});

export const manualPlayerEntrySchema = z.object({
  cardId: z.string().min(1),
  eligibleRoles: manualEligibleRolesSchema,
  historicalIgl: z.boolean(),
  traits: manualTraitsSchema,
  reviewed: z.boolean(),
}).strict();

export const manualPlayerCatalogSchema = z.object({
  version: z.literal(1),
  cards: z.array(manualPlayerEntrySchema),
}).strict();

export type ManualPlayerEntry = z.infer<typeof manualPlayerEntrySchema>;
export type ManualPlayerCatalog = z.infer<typeof manualPlayerCatalogSchema>;

function catalogError(message: string): Error {
  return new Error(`Invalid manual player catalog: ${message}`);
}

export function parseManualCatalog(input: unknown, expectedCardIds: readonly string[]): ManualPlayerCatalog {
  const parsed = manualPlayerCatalogSchema.safeParse(input);
  if (!parsed.success) {
    throw catalogError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }

  if (parsed.data.cards.length !== expectedCardIds.length) {
    throw catalogError(`expected ${expectedCardIds.length} cards, received ${parsed.data.cards.length}`);
  }

  const actualIds = parsed.data.cards.map(card => card.cardId);
  const duplicates = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  if (duplicates.length) {
    throw catalogError(`duplicate card IDs: ${[...new Set(duplicates)].join(", ")}`);
  }

  const mismatch = expectedCardIds.findIndex((id, index) => actualIds[index] !== id);
  if (mismatch !== -1) {
    throw catalogError(`card ${mismatch + 1} must be ${expectedCardIds[mismatch]}, received ${actualIds[mismatch] ?? "missing"}`);
  }

  return parsed.data;
}

export function createInitialManualCatalog(cards: readonly PlayerCard[]): ManualPlayerCatalog {
  return {
    version: 1,
    cards: [...cards].sort((left, right) => left.id.localeCompare(right.id)).map(card => ({
      cardId: card.id,
      eligibleRoles: [...card.eligibleRoles] as Role[],
      historicalIgl: card.historicalIgl,
      traits: { ...card.traits } as Traits,
      reviewed: false,
    })),
  };
}

export function applyManualCatalog(cards: readonly PlayerCard[], catalog: ManualPlayerCatalog): PlayerCard[] {
  const entries = new Map(catalog.cards.map(entry => [entry.cardId, entry]));
  return cards.map(card => {
    const entry = entries.get(card.id);
    if (!entry) throw catalogError(`missing card ${card.id}`);
    return {
      ...card,
      eligibleRoles: [...entry.eligibleRoles],
      historicalIgl: entry.historicalIgl,
      traits: { ...entry.traits },
      sourceIds: [...card.sourceIds],
    };
  });
}
