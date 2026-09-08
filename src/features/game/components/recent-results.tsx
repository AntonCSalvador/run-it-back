"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES, type PlayerCard } from "../domain";
import type { DailyRun, FreePlayRun, StoredRunResult } from "../storage";

export interface RecentResultsProps {
  daily: readonly DailyRun[];
  free: readonly FreePlayRun[];
  cards: readonly PlayerCard[];
  open: boolean;
  selectedKey: string | null;
  onOpenChange(open: boolean): void;
  onSelectedKeyChange(key: string | null): void;
}

export interface ResultNameItem {
  readonly key: string;
  readonly label: "Daily" | "Free Play";
  readonly run: StoredRunResult;
}

export interface ResultNameReconciliation {
  readonly names: ReadonlyMap<string, string>;
  readonly nextLedger: ReadonlyMap<string, number>;
}

export const RESULT_NAME_SEARCH_LIMITS = {
  maxLength: 140,
  maxCombinations: 256,
  maxFacts: 3,
} as const;

function outcome(run: StoredRunResult): "Champion" | "Eliminated" | "Completed" {
  if (run.outcome === "champion") return "Champion";
  if (run.outcome === "eliminated") return "Eliminated";
  const final = run.series.at(-1);
  if (final?.stage === "final" && final.userWins === 3) return "Champion";
  if (final && final.opponentWins > final.userWins) return "Eliminated";
  return "Completed";
}

function freeRunIdentity(run: FreePlayRun): string {
  return JSON.stringify([
    run.completedAtUtc,
    run.stageReached,
    run.outcome ?? null,
    run.rerollsUsed,
    run.iglCardId ?? null,
    run.roster.map(slot => [slot.role, slot.cardId]),
    run.series.map(series => [series.stage, series.userWins, series.opponentWins, series.maps?.map(map => [map.map, map.userScore, map.opponentScore]) ?? null]),
  ]);
}

function resultIdentity(run: StoredRunResult): string {
  return JSON.stringify([
    run.mode,
    run.mode === "daily" ? run.utcDate : null,
    run.completedAtUtc,
    run.stageReached,
    run.outcome ?? null,
    run.rerollsUsed,
    run.iglCardId ?? null,
    ROLES.map(role => [role, run.roster.find(slot => slot.role === role)?.cardId ?? null]),
    run.series.map(series => [series.stage, series.userWins, series.opponentWins, series.maps?.map(map => [map.map, map.userScore, map.opponentScore]) ?? null]),
  ]);
}

function freeRunItems(free: readonly FreePlayRun[]) {
  const occurrences = new Map<string, number>();
  return free.map(run => {
    const identity = freeRunIdentity(run);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { key: `free:${identity}:${occurrence}`, label: "Free Play" as const, run };
  });
}

const stageNames = {
  group: "Group stage",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
} as const;

function playerName(cardId: string, cards: ReadonlyMap<string, PlayerCard>): string {
  const card = cards.get(cardId);
  return card ? `${card.displayHandle} ${card.year}` : "Unavailable player";
}

interface ResultFact {
  readonly id: string;
  readonly text: string;
  readonly value: string;
}

const shortStageNames = {
  group: "Group",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
} as const;

function resultFacts(run: StoredRunResult, cards: ReadonlyMap<string, PlayerCard>): readonly ResultFact[] {
  const iglName = run.iglCardId ? playerName(run.iglCardId, cards) : "not recorded";
  const igl = { id: "igl", text: `IGL ${iglName}`, value: iglName };
  const lineup = ROLES.map(role => {
    const slot = run.roster.find(candidate => candidate.role === role);
    const roleName = `${role[0].toUpperCase()}${role.slice(1)}`;
    const name = slot ? playerName(slot.cardId, cards) : "not recorded";
    return { id: `role:${role}`, text: `${roleName} ${name}`, value: name };
  });
  const series = run.series.map(result => {
    const score = `${result.userWins}–${result.opponentWins}`;
    return { id: `series:${result.stage}`, text: `${shortStageNames[result.stage]} ${score}`, value: score };
  });
  const mapAvailability = run.series.map(result => {
    const value = result.maps ? "recorded" : "not recorded";
    return { id: `maps:${result.stage}:availability`, text: `${shortStageNames[result.stage]} map scores ${value}`, value };
  });
  const maps = run.series.flatMap(result => result.maps?.map((map, index) => {
    const value = `${map.map}:${map.userScore}–${map.opponentScore}`;
    return { id: `maps:${result.stage}:${index}`, text: `${shortStageNames[result.stage]} ${map.map} ${map.userScore}–${map.opponentScore}`, value };
  }) ?? []);
  const outcomeProvenance = run.outcome
    ? { id: "outcome-provenance", text: "Outcome recorded", value: "recorded" }
    : { id: "outcome-provenance", text: "Outcome inferred", value: "inferred" };
  return [igl, ...lineup, ...series, ...mapAvailability, ...maps, outcomeProvenance];
}

export function reconcileResultControlNames(
  runs: readonly ResultNameItem[],
  cards: ReadonlyMap<string, PlayerCard>,
  referenceLedger: ReadonlyMap<string, number>,
): ResultNameReconciliation {
  type NamedRun = (typeof runs)[number] & { readonly facts: readonly ResultFact[]; readonly identity: string };
  const groups = new Map<string, NamedRun[]>();
  for (const item of runs) {
    const date = item.run.mode === "daily" ? item.run.utcDate : item.run.completedAtUtc;
    const rerolls = `${item.run.rerollsUsed} reroll${item.run.rerollsUsed === 1 ? "" : "s"} used`;
    const base = `View ${item.label} result from ${date}: ${outcome(item.run)}, ${stageNames[item.run.stageReached]}, ${rerolls}`;
    groups.set(base, [...(groups.get(base) ?? []), { ...item, facts: resultFacts(item.run, cards), identity: resultIdentity(item.run) }]);
  }
  const names = new Map<string, string>();

  function shortestDiscriminator(item: NamedRun, others: readonly NamedRun[], base: string, reservedSuffix: string): readonly ResultFact[] | null {
    if (!others.length) return [];
    const otherValues = others.map(other => new Map(other.facts.map(fact => [fact.id, fact.value])));
    let attempts = 0;

    for (let targetSize = 1; targetSize <= RESULT_NAME_SEARCH_LIMITS.maxFacts; targetSize += 1) {
      let match: readonly ResultFact[] | null = null;
      const visit = (start: number, selected: readonly ResultFact[]): void => {
        if (match || attempts >= RESULT_NAME_SEARCH_LIMITS.maxCombinations) return;
        if (selected.length === targetSize) {
          attempts += 1;
          const label = `${base}. ${selected.map(fact => fact.text).join(". ")}${reservedSuffix}`;
          if (label.length > RESULT_NAME_SEARCH_LIMITS.maxLength) return;
          if (otherValues.every(values => selected.some(fact => values.get(fact.id) !== fact.value))) match = selected;
          return;
        }
        for (let index = start; index < item.facts.length; index += 1) {
          visit(index + 1, [...selected, item.facts[index]]);
          if (match || attempts >= RESULT_NAME_SEARCH_LIMITS.maxCombinations) return;
        }
      };
      visit(0, []);
      if (match) return match;
      if (attempts >= RESULT_NAME_SEARCH_LIMITS.maxCombinations) return null;
    }
    return null;
  }

  const activeKeys = new Set(runs.map(item => item.key));
  const retainedEntries = [...referenceLedger].filter(([key]) => activeKeys.has(key));
  let nextLedger: ReadonlyMap<string, number> = retainedEntries.length === referenceLedger.size
    ? referenceLedger
    : new Map(retainedEntries);
  const usedReferences = new Set(nextLedger.values());
  const referenceFor = (key: string): number => {
    const current = nextLedger.get(key);
    if (current) return current;
    let next = 1;
    while (usedReferences.has(next)) next += 1;
    const updated = new Map(nextLedger);
    updated.set(key, next);
    nextLedger = updated;
    usedReferences.add(next);
    return next;
  };

  for (const [base, items] of groups) {
    if (items.length === 1) {
      names.set(items[0].key, base);
      continue;
    }
    const exactGroups = new Map<string, NamedRun[]>();
    for (const item of items) {
      exactGroups.set(item.identity, [...(exactGroups.get(item.identity) ?? []), item]);
    }
    const representatives = [...exactGroups.values()].map(group => group[0]);
    for (const matching of exactGroups.values()) {
      const representative = matching[0];
      const reservedSuffix = matching.length > 1 ? `, run ${matching.length} of ${matching.length}` : "";
      const facts = shortestDiscriminator(representative, representatives.filter(other => other !== representative), base, reservedSuffix);
      const sharedName = facts === null
        ? `${base}. Saved result ${referenceFor(representative.key)}`
        : facts.length ? `${base}. ${facts.map(fact => fact.text).join(". ")}` : base;
      matching.forEach((item, index) => names.set(
        item.key,
        matching.length === 1 ? sharedName : `${sharedName}, run ${index + 1} of ${matching.length}`,
      ));
    }
  }
  return { names, nextLedger };
}

export function RecentResults({ daily, free, cards, open, selectedKey, onOpenChange, onSelectedKeyChange }: RecentResultsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const lastFocusIntent = useRef<string | null>(null);
  const [resultReferences, setResultReferences] = useState<ReadonlyMap<string, number>>(() => new Map());
  const allRuns = useMemo(() => [
    ...daily.map(run => ({ key: `daily-${run.utcDate}`, label: "Daily" as const, run })),
    ...freeRunItems(free),
  ], [daily, free]);
  const visibleKeys = useMemo(() => new Set([
    ...daily.slice(0, 3).map(run => `daily-${run.utcDate}`),
    ...freeRunItems(free).slice(0, 3).map(item => item.key),
  ]), [daily, free]);
  const runs = allRuns.filter(item => visibleKeys.has(item.key));
  const byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  const reconciliation = useMemo(
    () => reconcileResultControlNames(allRuns, byId, resultReferences),
    [allRuns, byId, resultReferences],
  );
  const controlNames = reconciliation.names;
  const selectedRun = open ? allRuns.find(item => item.key === selectedKey) : undefined;

  useEffect(() => {
    if (reconciliation.nextLedger !== resultReferences) {
      // This records allocations only after React commits the candidate UI. The reconciler
      // preserves object identity once settled, so this cannot form an effect/render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultReferences(current => current === resultReferences ? reconciliation.nextLedger : current);
    }
  }, [reconciliation.nextLedger, resultReferences]);

  const focusIntent = open ? selectedKey : null;
  useEffect(() => {
    if (focusIntent && focusIntent !== lastFocusIntent.current) heading.current?.focus();
    lastFocusIntent.current = focusIntent;
  }, [focusIntent]);

  if (!runs.length) return <section className="recent-results recent-results--empty" aria-label="Recent results">
    <h2>Recent results</h2>
    <p>No saved results yet. Complete a run to build your history.</p>
  </section>;

  const toggleOpen = (): void => {
    if (open) onSelectedKeyChange(null);
    onOpenChange(!open);
  };
  return <section className="recent-results" aria-label="Recent results">
    <div className="recent-results__heading">
      <h2>Recent results</h2>
      <button type="button" aria-expanded={open} onClick={toggleOpen}>{open ? "Hide" : "Show"} saved results</button>
    </div>
    {open && <>
      <ul className="recent-results__list">{runs.map(({ key, label, run }) => <li key={key}>
        <button type="button" aria-label={controlNames.get(key)} aria-expanded={selectedKey === key} onClick={() => onSelectedKeyChange(selectedKey === key ? null : key)}>View {label} result</button>
        <span>{outcome(run)} · {run.stageReached}</span>
      </li>)}</ul>
      {selectedRun && <section aria-label={`${selectedRun.label} result details`} className="recent-results__detail">
        <h3 ref={heading} tabIndex={-1}>{selectedRun.label} result</h3>
        <p>{outcome(selectedRun.run)} at {selectedRun.run.stageReached}. Rerolls used: {selectedRun.run.rerollsUsed}</p>
        <ul>{selectedRun.run.roster.map(slot => {
          const card = byId.get(slot.cardId);
          return <li key={slot.role}>{slot.role}: {card?.displayHandle ?? "Unknown player"} {card?.year ?? ""}{slot.cardId === selectedRun.run.iglCardId ? " · IGL" : ""}</li>;
        })}</ul>
        <ol>{selectedRun.run.series.map(series => <li key={series.stage}>{series.stage}: {series.userWins}–{series.opponentWins}</li>)}</ol>
      </section>}
    </>}
  </section>;
}
