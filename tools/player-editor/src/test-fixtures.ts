import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, Role, TeamAppearance, Traits } from "@/features/game/domain";
import type { EditorCard, EditorDocument } from "./types";

interface EditorCardFixture {
  id: string;
  handle: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  year: 2023 | 2024;
  roles: [Exclude<Role, "flex">];
  historicalIgl: boolean;
  traits: Traits;
}

function makeEditorCard(fixture: EditorCardFixture): EditorCard {
  const mapsPlayed = 10;
  const sourceIds = ["vct-reference-dataset"];
  const generated: PlayerCard = {
    id: fixture.id,
    playerId: `player-${fixture.id}`,
    teamId: fixture.teamId,
    year: fixture.year,
    displayHandle: fixture.handle,
    mapsPlayed,
    eligibleRoles: [...fixture.roles],
    historicalIgl: fixture.historicalIgl,
    traits: { ...fixture.traits },
    sourceIds: [...sourceIds],
  };
  const manual = {
    cardId: fixture.id,
    eligibleRoles: [...fixture.roles],
    historicalIgl: fixture.historicalIgl,
    traits: { ...fixture.traits },
    reviewed: false,
  };
  const agentClassMaps: Evidence["agentClassMaps"] = {
    smokes: fixture.roles[0] === "smokes" ? mapsPlayed : 0,
    duelist: fixture.roles[0] === "duelist" ? mapsPlayed : 0,
    initiator: fixture.roles[0] === "initiator" ? mapsPlayed : 0,
    sentinel: fixture.roles[0] === "sentinel" ? mapsPlayed : 0,
  };
  const evidence: Evidence = {
    cardId: fixture.id,
    year: fixture.year,
    mapsPlayed,
    threshold: 2,
    agentClassMaps,
    suggestedRoles: [...fixture.roles],
    finalEligibleRoles: [...fixture.roles],
    override: null,
    sourceIds: [...sourceIds],
    clutchCoverageMaps: mapsPlayed,
    clutchWins: 0,
    clutchSourceIds: [...sourceIds],
    performanceAvailableMaps: mapsPlayed,
  };
  const team: TeamAppearance = {
    id: fixture.teamId,
    name: fixture.teamName,
    shortName: fixture.teamShortName,
    year: fixture.year,
    logo: null,
    sourceIds: [...sourceIds],
  };
  return { generated, manual, evidence, team };
}

export function makeEditorDocument(): EditorDocument {
  return {
    revision: "a".repeat(64),
    traitWeights: {
      firepower: 0.35,
      utility: 0.2,
      survival: 0.15,
      clutch: 0.15,
      consistency: 0.15,
    },
    cards: [
      makeEditorCard({
        id: "boaster-fnatic-2023",
        handle: "Boaster",
        teamId: "fnatic-2023",
        teamName: "FNATIC",
        teamShortName: "FNC",
        year: 2023,
        roles: ["smokes"],
        historicalIgl: true,
        traits: { firepower: 47, utility: 69, survival: 97, clutch: 94, consistency: 13, leadership: 75 },
      }),
      makeEditorCard({
        id: "2024-card-id",
        handle: "2024 Player",
        teamId: "example-2024",
        teamName: "Example Team",
        teamShortName: "EX",
        year: 2024,
        roles: ["initiator"],
        historicalIgl: false,
        traits: { firepower: 60, utility: 70, survival: 50, clutch: 40, consistency: 80, leadership: 50 },
      }),
    ],
  };
}
