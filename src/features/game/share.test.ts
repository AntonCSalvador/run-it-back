import { describe, expect, it } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "./schema";
import { formatDailyShare, formatFreePlayShare } from "./share";
import type { DailyRun, FreePlayRun } from "./storage";

const roster = ["aspas-team-1-2022", "player-2-team-1-2022", "player-3-team-1-2022", "player-4-team-1-2022", "player-5-team-1-2022"].map((cardId, index) => ({ role: ["smokes", "duelist", "initiator", "sentinel", "flex"][index] as "smokes" | "duelist" | "initiator" | "sentinel" | "flex", cardId }));
const run = { mode: "daily" as const, utcDate: "2026-09-05", completedAtUtc: "2026-09-05", stageReached: "semifinal" as const, series: [{ stage: "group" as const, userWins: 2, opponentWins: 1 }, { stage: "quarterfinal" as const, userWins: 0, opponentWins: 2 }], rerollsUsed: 2, roster };
const freeRun: FreePlayRun = { ...run, mode: "free" };

describe("share formatters", () => {
  it("formats a deterministic compact Daily summary without private game internals", () => {
    const share = formatDailyShare({ ...run, opponent: "secret", seed: "seed", probability: .9 } as typeof run);
    expect(share).toContain("2026-09-05"); expect(share).toContain("semifinal"); expect(share).toContain("W 2-1"); expect(share).toContain("L 0-2"); expect(share).toContain("Rerolls: 2"); expect(share).toContain("Run It Back");
    expect(share).not.toMatch(/aspas|team-|secret|seed|probability|rating|chemistry/i);
    expect(formatDailyShare(run)).toBe(formatDailyShare(run));
  });

  it("requires and validates a UTC date for Daily shares", () => {
    if (false) {
      // @ts-expect-error Daily shares must have a date at compile time.
      formatDailyShare({ ...run, utcDate: undefined });
    }
    expect(() => formatDailyShare({ ...run, utcDate: undefined } as unknown as DailyRun)).toThrow("UTC date");
    expect(() => formatDailyShare({ ...run, utcDate: "2026-02-31" } as unknown as DailyRun)).toThrow("UTC date");
  });

  it("adds exactly five normalized roster handles in fixed role order for Free Play", () => {
    const share = formatFreePlayShare(freeRun, parseDataset(minimalDataset));
    expect(share).toContain("aspas (smokes)");
    expect(share).toMatch(/player-2 \(duelist\)[\s\S]*player-3 \(initiator\)[\s\S]*player-4 \(sentinel\)[\s\S]*player-5 \(flex\)/);
    expect((share.match(/ \([a-z]+\)/g) ?? [])).toHaveLength(5);
    expect(share).not.toMatch(/seed|probability|rating|chemistry/i);
  });
});
