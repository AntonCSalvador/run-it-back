import type { Role, Traits } from "@/features/game/domain";

export type RawMap = [string, string, number, string, boolean, number | null, number | null, number | null, number | null];
export type RawCard = { year: number; playerId: number; playerName: string; teamId: number; maps: RawMap[]; clutchWins: number };
export type RawExtraction = {
  databaseSha256: string;
  teams: { year: number; teamId: number; name: string }[];
  matches: { year: number; matchId: string; team0: number; team1: number; stage: string; round: string; score0: number; score1: number }[];
  cards: RawCard[];
};
export type Override = { roles: Role[]; reason: string; sourceIds: string[] };
export type Overlays = {
  teams: { databaseTeamId: number; id: string; year: number; name: string; shortName: string; sourceIds: string[] }[];
  roleOverrides: (Override & { cardId: string })[];
  leadership: { cardId: string; sourceIds: string[] }[];
};
export const CLASS_ROLES = ["smokes", "duelist", "initiator", "sentinel"] as const;
const AGENTS: Record<string, Exclude<Role, "flex">> = Object.fromEntries([
  ["smokes", "astra brimstone clove harbor omen viper"],
  ["duelist", "iso jett neon phoenix raze reyna waylay yoru"],
  ["initiator", "breach fade gekko kayo skye sova tejo"],
  ["sentinel", "chamber cypher deadlock killjoy sage vyse"],
].flatMap(([role, names]) => names.split(" ").map(name => [name, role]))) as Record<string, Exclude<Role, "flex">>;
const METRICS = ["firepower", "utility", "survival", "clutch", "consistency"] as const;
type Metric = typeof METRICS[number];
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
// Quantize raw comparison scores before percentile ties; all inputs are finite DB numbers.
const quantize = (value: number) => Math.round(value * 1e9) / 1e9;
export const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function percentile(value: number, cohort: number[]): number {
  if (!cohort.length) throw new Error("empty percentile cohort");
  return 100 * (cohort.filter(candidate => candidate < value).length + cohort.filter(candidate => candidate === value).length / 2) / cohort.length;
}

/** Small editorial progression adjustment, derived only from recorded bracket rounds. */
export function progression(raw: RawExtraction, year: number, teamId: number): number {
  let bonus = 0;
  for (const match of raw.matches.filter(row => row.year === year && (row.team0 === teamId || row.team1 === teamId))) {
    if (match.stage !== "Playoffs") continue;
    bonus = Math.max(bonus, 1);
    if (["Semifinals", "Upper Semifinals", "Upper Final", "Lower Round 3", "Lower Final"].includes(match.round)) bonus = Math.max(bonus, 2);
    if (match.round === "Grand Final") {
      const won = match.team0 === teamId ? match.score0 > match.score1 : match.score1 > match.score0;
      bonus = Math.max(bonus, won ? 4 : 3);
    }
  }
  return bonus;
}

export function deriveChampions(raw: RawExtraction, overlays: Overlays) {
  const rows = raw.cards.map(card => {
    const team = overlays.teams.find(row => row.year === card.year && row.databaseTeamId === card.teamId);
    if (!team) throw new Error(`unreviewed team mapping ${card.year}/${card.teamId}`);
    const id = `${slug(card.playerName)}-${team.id}`;
    const mapsPlayed = card.maps.length;
    const agentClassMaps = { smokes: 0, duelist: 0, initiator: 0, sentinel: 0 };
    for (const map of card.maps) {
      const role = AGENTS[map[3]];
      if (!role) throw new Error(`unmapped agent ${map[3]}`);
      agentClassMaps[role]++;
      const match = raw.matches.find(row => row.year === card.year && row.matchId === map[0]);
      if (!match || (map[2] === 0 ? match.team0 : map[2] === 1 ? match.team1 : -1) !== card.teamId) throw new Error(`team index ${id}`);
    }
    const threshold = Math.max(2, Math.ceil(mapsPlayed * 0.2));
    const suggestedRoles: Role[] = CLASS_ROLES.filter(role => agentClassMaps[role] >= threshold);
    if (suggestedRoles.length >= 2) suggestedRoles.push("flex");
    const reviewed = overlays.roleOverrides.find(row => row.cardId === id);
    const override: Override | null = reviewed ? { roles: reviewed.roles, reason: reviewed.reason, sourceIds: reviewed.sourceIds } : null;
    const eligibleRoles = override?.roles ?? suggestedRoles;
    if (override && (!override.reason.trim() || !override.sourceIds.length || eligibleRoles.join() === suggestedRoles.join() || eligibleRoles.some(role => role === "flex" ? !suggestedRoles.includes("flex") : agentClassMaps[role] === 0))) throw new Error(`invalid reviewed override ${id}`);
    if (!eligibleRoles.length) throw new Error(`no eligible roles ${id}`);
    const performanceAvailableMaps = card.maps.filter(map => map[4]).length;
    const complete = performanceAvailableMaps === mapsPlayed;
    const metric = (indexes: number[], calculate: () => number): number | null => complete && card.maps.every(map => indexes.every(index => typeof map[index] === "number" && Number.isFinite(map[index]))) ? quantize(calculate()) : null;
    const ratings = card.maps.map(map => map[5] as number);
    const ratingMean = mean(ratings);
    const scores: Record<Metric, number | null> = {
      firepower: metric([5, 6], () => 0.65 * ratingMean + 0.35 * mean(card.maps.map(map => map[6] as number)) / 200),
      utility: metric([7], () => mean(card.maps.map(map => map[7] as number))),
      survival: metric([8], () => -mean(card.maps.map(map => map[8] as number))),
      clutch: complete ? quantize(card.clutchWins / mapsPlayed) : null,
      consistency: metric([5], () => -Math.sqrt(mean(ratings.map(value => (value - ratingMean) ** 2)))),
    };
    return { id, playerId: `player-${card.playerId}`, teamId: team.id, year: card.year, displayHandle: card.playerName,
      mapsPlayed, agentClassMaps, threshold, suggestedRoles, eligibleRoles, override, performanceAvailableMaps,
      clutchWins: card.clutchWins, progressionBonus: progression(raw, card.year, card.teamId), scores };
  });
  return rows.map(row => {
    const historicalIgl = overlays.leadership.some(leader => leader.cardId === row.id);
    const traits = { leadership: historicalIgl ? 75 : 50 } as Traits;
    for (const metric of METRICS) {
      const score = row.scores[metric];
      if (score === null) { traits[metric] = 50; continue; }
      // Multi-role cards receive the equal-weight mean of their non-Flex role percentiles.
      const rolePercentiles = row.eligibleRoles.filter(role => role !== "flex").map(role => {
        const cohort = rows.filter(peer => peer.year === row.year && peer.eligibleRoles.includes(role) && peer.scores[metric] !== null).map(peer => peer.scores[metric] as number);
        return percentile(score, cohort);
      });
      traits[metric] = Math.max(0, Math.min(100, Math.round(mean(rolePercentiles) + row.progressionBonus)));
    }
    return { ...row, historicalIgl, traits };
  });
}
