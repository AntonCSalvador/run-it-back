import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DailyRun, FreePlayRun } from "../storage";
import { RecentResults, RESULT_NAME_SEARCH_LIMITS, reconcileResultControlNames, type ResultNameItem } from "./recent-results";
import { parseDataset } from "../schema";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";

const roster = ["smokes", "duelist", "initiator", "sentinel", "flex"].map((role, index) => ({ role, cardId: `card-${index}` })) as FreePlayRun["roster"];
const cards = parseDataset(minimalDataset).cards;

function freeRun(rerollsUsed: number): FreePlayRun {
  return {
    mode: "free", completedAtUtc: "2026-09-05", stageReached: "group", outcome: "eliminated", rerollsUsed,
    roster, iglCardId: "card-0",
    series: [{ stage: "group", userWins: 0, opponentWins: 2, maps: [{ map: "Ascent", userScore: 7, opponentScore: 13 }, { map: "Bind", userScore: 8, opponentScore: 13 }] }],
  };
}

function dailyRun(utcDate: string): DailyRun {
  return { ...freeRun(0), mode: "daily", utcDate, completedAtUtc: utcDate };
}

function distinctRun(offset: number, userScore: number): FreePlayRun {
  return {
    ...freeRun(1),
    roster: roster.map((slot, index) => ({ ...slot, cardId: cards[offset + index].id })),
    iglCardId: cards[offset].id,
    series: [{ stage: "group", userWins: 0, opponentWins: 2, maps: [{ map: "Ascent", userScore, opponentScore: 13 }, { map: "Bind", userScore: userScore + 1, opponentScore: 13 }] }],
  };
}

function championRun(): FreePlayRun {
  return {
    ...distinctRun(0, 13),
    stageReached: "final",
    outcome: "champion",
    rerollsUsed: 0,
    series: [
      { stage: "group", userWins: 2, opponentWins: 0, maps: [{ map: "Ascent", userScore: 13, opponentScore: 8 }, { map: "Bind", userScore: 13, opponentScore: 9 }] },
      { stage: "quarterfinal", userWins: 2, opponentWins: 1, maps: [{ map: "Ascent", userScore: 13, opponentScore: 8 }, { map: "Bind", userScore: 9, opponentScore: 13 }, { map: "Haven", userScore: 13, opponentScore: 10 }] },
      { stage: "semifinal", userWins: 2, opponentWins: 0, maps: [{ map: "Ascent", userScore: 13, opponentScore: 10 }, { map: "Bind", userScore: 13, opponentScore: 11 }] },
      { stage: "final", userWins: 3, opponentWins: 1, maps: [{ map: "Ascent", userScore: 13, opponentScore: 8 }, { map: "Bind", userScore: 10, opponentScore: 13 }, { map: "Haven", userScore: 13, opponentScore: 9 }, { map: "Lotus", userScore: 13, opponentScore: 11 }] },
    ],
  };
}

function adversarialRuns(): FreePlayRun[] {
  const baseline = { ...championRun(), iglCardId: undefined };
  const roleVariants = baseline.roster.map((_, roleIndex) => ({
    ...baseline,
    roster: baseline.roster.map((slot, index) => index === roleIndex ? { ...slot, cardId: cards[20 + roleIndex].id } : slot),
  }));
  const mapVariants = baseline.series.flatMap((targetSeries, seriesIndex) => targetSeries.maps!.map((_, mapIndex) => ({
    ...baseline,
    series: baseline.series.map((series, candidateSeriesIndex) => candidateSeriesIndex !== seriesIndex ? series : {
      ...series,
      maps: series.maps!.map((map, candidateMapIndex) => {
        if (candidateMapIndex !== mapIndex) return map;
        return map.userScore > map.opponentScore
          ? { ...map, opponentScore: map.opponentScore === 11 ? 10 : map.opponentScore + 1 }
          : { ...map, userScore: map.userScore === 11 ? 10 : map.userScore + 1 };
      }),
    }),
  })));
  const inferred = { ...baseline };
  delete inferred.outcome;
  const igl = { ...baseline, iglCardId: baseline.roster[0].cardId };
  return [baseline, ...roleVariants, ...mapVariants, inferred, igl];
}

describe("RecentResults", () => {
  it("reconciles names without mutating the committed reference ledger", () => {
    const ledger = new Map<string, number>();
    const items: ResultNameItem[] = adversarialRuns().map((run, index) => ({ key: `candidate:${index}`, label: "Free Play", run }));

    const candidate = reconcileResultControlNames(items, new Map(cards.map(card => [card.id, card])), ledger);

    expect([...ledger]).toEqual([]);
    expect(candidate.nextLedger).not.toBe(ledger);
    expect(candidate.nextLedger.size).toBeGreaterThan(0);
  });

  it("does not let an abandoned candidate consume a later committed reference", () => {
    const ledger = new Map<string, number>();
    const runs = adversarialRuns();
    const abandoned = runs.map((run, index) => ({ key: `abandoned:${index}`, label: "Free Play" as const, run }));
    const committed = runs.map((run, index) => ({ key: `committed:${index}`, label: "Free Play" as const, run }));

    reconcileResultControlNames(abandoned, new Map(cards.map(card => [card.id, card])), ledger);
    const candidate = reconcileResultControlNames(committed, new Map(cards.map(card => [card.id, card])), ledger);

    expect([...ledger]).toEqual([]);
    expect([...candidate.names.values()]).toContainEqual(expect.stringMatching(/Saved result 1$/));
  });

  it("keeps a unique full-tournament result name concise", () => {
    render(<RecentResults daily={[]} free={[championRun()]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const name = screen.getByRole("button", { name: /View Free Play result/ }).getAttribute("aria-label")!;
    expect(name).toMatch(/^View Free Play result from 2026-09-05: Champion, Final, 0 rerolls used/);
    expect(name.length).toBeLessThanOrEqual(140);
    expect(name).not.toMatch(/Roster:|Series:/);
  });

  it("keeps a selected Free Play record stable when a same-day run is prepended", () => {
    const selected = vi.fn();
    const target = freeRun(2);
    const view = render(<RecentResults daily={[]} free={[target]} cards={[]} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={selected} />);
    const targetControl = screen.getByRole("button", { name: /View Free Play result/ });
    const targetName = targetControl.getAttribute("aria-label");
    fireEvent.click(targetControl);
    const selectedKey = selected.mock.calls[0][0] as string;

    view.rerender(<RecentResults daily={[]} free={[freeRun(1), target]} cards={[]} open selectedKey={selectedKey} onOpenChange={vi.fn()} onSelectedKeyChange={selected} />);

    expect(screen.getByRole("region", { name: "Free Play result details" })).toHaveTextContent("Rerolls used: 2");
    expect(screen.getByRole("button", { name: /View Free Play result/, expanded: true })).toHaveAccessibleName(targetName!);
  });

  it("resolves a selected Daily record outside the bounded recent list", () => {
    const older = dailyRun("2026-09-01");
    render(<RecentResults
      daily={[dailyRun("2026-09-04"), dailyRun("2026-09-03"), dailyRun("2026-09-02"), older]}
      free={[]}
      cards={[]}
      open
      selectedKey="daily-2026-09-01"
      onOpenChange={vi.fn()}
      onSelectedKeyChange={vi.fn()}
    />);

    expect(screen.getByRole("region", { name: "Daily result details" })).toHaveTextContent("Rerolls used: 0");
    expect(screen.getAllByRole("button", { name: /View Daily result from/ })).toHaveLength(3);
  });

  it("does not steal focus when storage refreshes the unchanged selected result", () => {
    const selectedKey = "daily-2026-09-04";
    const view = render(<StrictMode><RecentResults daily={[dailyRun("2026-09-04")]} free={[]} cards={[]} open selectedKey={selectedKey} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} /></StrictMode>);
    expect(screen.getByRole("heading", { name: "Daily result" })).toHaveFocus();
    const historyToggle = screen.getByRole("button", { name: "Hide saved results" });
    historyToggle.focus();

    view.rerender(<StrictMode><RecentResults daily={[{ ...dailyRun("2026-09-04") }]} free={[]} cards={[]} open selectedKey={selectedKey} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} /></StrictMode>);

    expect(historyToggle).toHaveFocus();
  });

  it("gives every result control a unique factual accessible name", () => {
    render(<RecentResults
      daily={[dailyRun("2026-09-04"), dailyRun("2026-09-03")]}
      free={[freeRun(1), freeRun(2)]}
      cards={[]}
      open
      selectedKey={null}
      onOpenChange={vi.fn()}
      onSelectedKeyChange={vi.fn()}
    />);

    const controls = screen.getAllByRole("button", { name: /View (?:Daily|Free Play) result/ });
    const names = controls.map(control => control.getAttribute("aria-label") ?? control.textContent ?? "");
    expect(new Set(names).size).toBe(controls.length);
    expect(names).toEqual(expect.arrayContaining([
      expect.stringMatching(/View Daily result.*2026-09-04.*Eliminated.*group/i),
      expect.stringMatching(/View Daily result.*2026-09-03.*Eliminated.*group/i),
    ]));
    expect(names.filter(name => /Free Play/.test(name))).toHaveLength(2);
    for (const name of names.filter(name => /Free Play/.test(name))) {
      expect(name).toMatch(/2026-09-05.*Eliminated.*group/i);
    }
    expect(names).toEqual(expect.arrayContaining([
      expect.stringMatching(/1 reroll used/i),
      expect.stringMatching(/2 rerolls used/i),
    ]));
  });

  it("keeps content-distinguished control names stable when a same-context run is prepended", () => {
    const first = distinctRun(0, 5);
    const second = distinctRun(5, 7);
    const view = render(<RecentResults daily={[]} free={[first, second]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);
    const originalNames = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(new Set(originalNames).size).toBe(2);
    expect(originalNames[0]).toMatch(/IGL aspas 2022/);
    expect(originalNames[0].length).toBeLessThanOrEqual(140);
    expect(originalNames[0]).not.toMatch(/Roster:|Series:/);
    expect(originalNames[0]).not.toContain(cards[0].id);

    view.rerender(<RecentResults daily={[]} free={[distinctRun(10, 9), first, second]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const updatedNames = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(new Set(updatedNames).size).toBe(3);
    expect(updatedNames).toEqual(expect.arrayContaining(originalNames));
  });

  it("uses only the differing roster fact when colliding runs share an IGL", () => {
    const first = distinctRun(0, 5);
    const second = {
      ...first,
      roster: first.roster.map(slot => slot.role === "sentinel" ? { ...slot, cardId: cards[8].id } : slot),
    };
    render(<RecentResults daily={[]} free={[first, second]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(new Set(names).size).toBe(2);
    expect(names.every(name => name.length <= 140)).toBe(true);
    expect(names.every(name => /Sentinel (?:player-4 2022|player-9 2021)/.test(name))).toBe(true);
    expect(names.every(name => !/Smokes|Duelist|Initiator|Flex/.test(name))).toBe(true);
  });

  it("keeps role discriminators stable when a fourth run has a different IGL", () => {
    const first = distinctRun(0, 5);
    const withSentinel = (cardIndex: number): FreePlayRun => ({
      ...first,
      roster: first.roster.map(slot => slot.role === "sentinel" ? { ...slot, cardId: cards[cardIndex].id } : slot),
    });
    const second = withSentinel(8);
    const third = withSentinel(13);
    const view = render(<RecentResults daily={[]} free={[first, second, third]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);
    const existingNames = screen.getAllByRole("button", { name: /View Free Play result/ }).slice(0, 2).map(control => control.getAttribute("aria-label")!);

    const newcomerLineup = withSentinel(18);
    const newcomer = { ...newcomerLineup, iglCardId: newcomerLineup.roster.find(slot => slot.role === "duelist")!.cardId };
    view.rerender(<RecentResults daily={[]} free={[newcomer, first, second, third]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const updatedNames = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(updatedNames).toEqual(expect.arrayContaining(existingNames));
    expect(updatedNames.every(name => name.length <= 140)).toBe(true);
  });

  it("adds the next shortest fact when a new run collides with an existing role discriminator", () => {
    const first = distinctRun(0, 5);
    const second = {
      ...first,
      roster: first.roster.map(slot => slot.role === "sentinel" ? { ...slot, cardId: cards[8].id } : slot),
    };
    const newcomer = { ...first, iglCardId: first.roster.find(slot => slot.role === "duelist")!.cardId };
    render(<RecentResults daily={[]} free={[newcomer, first, second]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(expect.arrayContaining([
      expect.stringMatching(/IGL player-2 2022$/),
      expect.stringMatching(/IGL aspas 2022\. Sentinel player-4 2022$/),
      expect.stringMatching(/Sentinel player-9 2021$/),
    ]));
    expect(names.every(name => name.length <= 140)).toBe(true);
  });

  it("uses a compact series fact only when lineup facts cannot distinguish runs", () => {
    const first = { ...distinctRun(0, 5), series: [{ stage: "group" as const, userWins: 0, opponentWins: 2 }] };
    const second = { ...first, series: [{ stage: "group" as const, userWins: 1, opponentWins: 2 }] };
    render(<RecentResults daily={[]} free={[first, second]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(names).toEqual(expect.arrayContaining([expect.stringMatching(/Group 0–2$/), expect.stringMatching(/Group 1–2$/)]));
    expect(names.every(name => name.length <= 140)).toBe(true);
    expect(names.every(name => !/IGL|Smokes|Maps/.test(name))).toBe(true);
  });

  it("uses only the differing map fact when aggregate series are identical", () => {
    const first = distinctRun(0, 5);
    const second = {
      ...first,
      series: [{ ...first.series[0], maps: [{ map: "Ascent", userScore: 7, opponentScore: 13 }, { map: "Bind", userScore: 6, opponentScore: 13 }] }],
    };
    render(<RecentResults daily={[]} free={[first, second]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(names).toEqual(expect.arrayContaining([expect.stringMatching(/Group Ascent 5–13$/), expect.stringMatching(/Group Ascent 7–13$/)]));
    expect(names.every(name => name.length <= 140)).toBe(true);
    expect(names.every(name => !/Bind/.test(name))).toBe(true);
  });

  it("distinguishes non-identical outcome provenance before using ordinals", () => {
    const recorded = championRun();
    const inferred = { ...recorded };
    delete inferred.outcome;
    render(<RecentResults daily={[]} free={[recorded, inferred]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(names).toEqual(expect.arrayContaining([expect.stringMatching(/Outcome recorded$/), expect.stringMatching(/Outcome inferred$/)]));
    expect(names.every(name => name.length <= 140)).toBe(true);
    expect(names.every(name => !/run \d/.test(name))).toBe(true);
  });

  it("bounds adversarial max-history naming and keeps session references stable", () => {
    expect(RESULT_NAME_SEARCH_LIMITS).toEqual({ maxLength: 140, maxCombinations: 256, maxFacts: 3 });
    const initial = adversarialRuns();
    expect(initial).toHaveLength(19);
    const renderResults = (runs: readonly FreePlayRun[]) => <StrictMode><RecentResults daily={[]} free={runs} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} /></StrictMode>;
    const view = render(renderResults(initial));
    const existingNames = screen.getAllByRole("button", { name: /View Free Play result/ }).slice(0, 2).map(control => control.getAttribute("aria-label")!);
    const newcomer = {
      ...initial[0],
      roster: initial[0].roster.map((slot, index) => index === 0 ? { ...slot, cardId: cards[29].id } : slot),
    };
    const allRuns = [newcomer, ...initial];

    view.rerender(renderResults(allRuns));
    const updatedNames = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(updatedNames).toEqual(expect.arrayContaining(existingNames));

    const targetNames = allRuns.map(target => {
      const reordered = [target, ...allRuns.filter(run => run !== target)];
      view.rerender(renderResults(reordered));
      return screen.getAllByRole("button", { name: /View Free Play result/ })[0].getAttribute("aria-label")!;
    });
    expect(new Set(targetNames).size).toBe(20);
    expect(targetNames.every(name => name.length <= RESULT_NAME_SEARCH_LIMITS.maxLength)).toBe(true);
    expect(targetNames.some(name => /Saved result \d+$/.test(name))).toBe(true);

    view.rerender(renderResults(allRuns.filter(run => run !== initial[0])));
    view.rerender(renderResults(allRuns));
    const readdedNames = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(new Set(readdedNames).size).toBe(readdedNames.length);
    expect(readdedNames.every(name => name.length <= RESULT_NAME_SEARCH_LIMITS.maxLength)).toBe(true);
  });

  it("keeps a fallback reference stable when a max-size prepend evicts the oldest result", () => {
    const collisions = adversarialRuns();
    const twentieth = {
      ...collisions[0],
      roster: collisions[0].roster.map((slot, index) => index === 0 ? { ...slot, cardId: cards[29].id } : slot),
    };
    const fullHistory = [...collisions, twentieth];
    expect(fullHistory).toHaveLength(20);
    const renderResults = (runs: readonly FreePlayRun[]) => <RecentResults daily={[]} free={runs} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />;
    const view = render(renderResults(fullHistory));
    const baselineName = screen.getAllByRole("button", { name: /View Free Play result/ })[0].getAttribute("aria-label")!;
    expect(baselineName).toMatch(/Saved result \d+$/);

    const newcomer = {
      ...collisions[0],
      roster: collisions[0].roster.map((slot, index) => index === 1 ? { ...slot, cardId: cards[28].id } : slot),
    };
    view.rerender(renderResults([newcomer, ...fullHistory].slice(0, 20)));

    expect(screen.getAllByRole("button", { name: /View Free Play result/ })[1]).toHaveAccessibleName(baselineName);
  });

  it("numbers exact duplicate results in natural occurrence order", () => {
    render(<RecentResults daily={[]} free={Array.from({ length: 12 }, () => freeRun(1))} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(names).toHaveLength(3);
    expect(names[0]).toMatch(/run 1 of 12$/);
    expect(names[1]).toMatch(/run 2 of 12$/);
    expect(names[2]).toMatch(/run 3 of 12$/);
  });

  it("keeps exact-duplicate ordinals inside the complete name limit", () => {
    const first = distinctRun(0, 5);
    const otherIgl = { ...first, iglCardId: first.roster.find(slot => slot.role === "duelist")!.cardId };
    const otherSentinel = {
      ...first,
      roster: first.roster.map(slot => slot.role === "sentinel" ? { ...slot, cardId: cards[8].id } : slot),
    };
    render(<RecentResults daily={[]} free={[first, { ...first }, otherIgl, otherSentinel]} cards={cards} open selectedKey={null} onOpenChange={vi.fn()} onSelectedKeyChange={vi.fn()} />);

    const names = screen.getAllByRole("button", { name: /View Free Play result/ }).map(control => control.getAttribute("aria-label")!);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every(name => name.length <= RESULT_NAME_SEARCH_LIMITS.maxLength)).toBe(true);
    expect(names[0]).toMatch(/run 1 of 2$/);
    expect(names[1]).toMatch(/run 2 of 2$/);
  });

  it("reserves space for two-digit exact-duplicate ordinals", () => {
    const longHandle = "x".repeat(32);
    const longCards = cards.map((card, index) => index === 2 ? { ...card, displayHandle: longHandle } : card);
    const longInitiator: FreePlayRun = {
      ...distinctRun(0, 5),
      stageReached: "quarterfinal",
      rerollsUsed: 3,
      roster: roster.map((slot, index) => index === 2 ? { ...slot, cardId: longCards[2].id } : slot),
      series: [
        { stage: "group", userWins: 2, opponentWins: 0 },
        { stage: "quarterfinal", userWins: 0, opponentWins: 2 },
      ],
    };
    const other = {
      ...longInitiator,
      roster: longInitiator.roster.map(slot => slot.role === "initiator" ? { ...slot, cardId: cards[8].id } : slot),
    };
    const items: ResultNameItem[] = [
      ...Array.from({ length: 12 }, (_, index) => ({ key: `duplicate:${index}`, label: "Free Play" as const, run: longInitiator })),
      { key: "other", label: "Free Play", run: other },
    ];

    const { names } = reconcileResultControlNames(items, new Map(longCards.map(card => [card.id, card])), new Map());

    expect(names.get("duplicate:11")).toMatch(/run 12 of 12$/);
    expect([...names.values()].every(name => name.length <= RESULT_NAME_SEARCH_LIMITS.maxLength)).toBe(true);
  });
});
