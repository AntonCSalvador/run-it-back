export const ROLES = ["smokes", "duelist", "initiator", "sentinel", "flex"] as const;
export type Role = (typeof ROLES)[number];
export type ChampionsYear = 2021 | 2022 | 2023 | 2024 | 2025;
export interface Traits { firepower: number; utility: number; survival: number; clutch: number; consistency: number; leadership: number }
export interface SourceRef { id: string; url: string; retrievedAt: string; usage: "facts" | "asset"; credit?: string; license?: string }
export interface TeamAppearance { id: string; name: string; shortName: string; year: ChampionsYear; logo: string | null; sourceIds: string[] }
export interface PlayerIdentity { id: string; canonicalHandle: string; portrait: string | null; sourceIds: string[] }
export interface PlayerCard { id: string; playerId: string; teamId: string; year: ChampionsYear; displayHandle: string; mapsPlayed: number; eligibleRoles: Role[]; historicalIgl: boolean; traits: Traits; sourceIds: string[] }
export interface GameDataset { version: number; sources: SourceRef[]; teams: TeamAppearance[]; players: PlayerIdentity[]; cards: PlayerCard[] }
export interface LineupSlot { role: Role; cardId: string }
export interface Lineup { slots: LineupSlot[]; iglCardId: string }
