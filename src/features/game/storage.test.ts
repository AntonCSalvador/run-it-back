import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DAILY_RECORD, HISTORY_RECORD, SETTINGS_RECORD, STORAGE_KEYS, addDailyCompletion, prependFreePlayHistory, readRecord, removeRecord, writeRecord, type DailyRun, type FreePlayRun, type HistoryStorage, type StoredRunResult } from "./storage";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  get length() { return this.entries.size; }
  clear() { this.entries.clear(); }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string) { this.entries.delete(key); }
  setItem(key: string, value: string) { this.entries.set(key, value); }
}
const freeRun = (id: string, date = "2026-09-05"): FreePlayRun => ({ mode: "free", stageReached: "group", completedAtUtc: date, series: [{ stage: "group", userWins: 0, opponentWins: 2 }], rerollsUsed: 1, roster: [{ role: "smokes", cardId: id }, { role: "duelist", cardId: "d" }, { role: "initiator", cardId: "i" }, { role: "sentinel", cardId: "s" }, { role: "flex", cardId: "f" }] });
const dailyRun = (date: string, stageReached: StoredRunResult["stageReached"] = "group"): DailyRun => stageReached === "final" ? ({ ...freeRun("a", date), mode: "daily", utcDate: date, stageReached, series: [{ stage: "group", userWins: 2, opponentWins: 0 }, { stage: "quarterfinal", userWins: 2, opponentWins: 0 }, { stage: "semifinal", userWins: 2, opponentWins: 0 }, { stage: "final", userWins: 3, opponentWins: 0 }] }) : ({ ...freeRun("a", date), mode: "daily", utcDate: date, stageReached });

describe("local run storage", () => {
  it("uses namespaced v1 keys and round trips each valid record", () => {
    expect(STORAGE_KEYS).toEqual({ settings: "run-it-back:settings:v1", daily: "run-it-back:daily:v1", history: "run-it-back:history:v1" });
    const storage = new MemoryStorage();
    expect(writeRecord(storage, SETTINGS_RECORD, { soundEnabled: false }).persistent).toBe(true);
    expect(writeRecord(storage, DAILY_RECORD, { completions: [dailyRun("2026-09-05")], streak: 1 }).persistent).toBe(true);
    writeRecord(storage, HISTORY_RECORD, { runs: [freeRun("one")] });
    expect(readRecord(storage, SETTINGS_RECORD).value).toEqual({ soundEnabled: false });
    expect(readRecord(storage, DAILY_RECORD).value.streak).toBe(1);
    expect(readRecord(storage, HISTORY_RECORD).value.runs).toEqual([freeRun("one")]);
  });

  it("recovers only a corrupt namespaced record without changing others", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.settings, "{bad json");
    storage.setItem(STORAGE_KEYS.history, JSON.stringify({ version: 1, runs: [freeRun("unchanged")] }));
    const before = storage.getItem(STORAGE_KEYS.history);
    const result = readRecord(storage, SETTINGS_RECORD);
    expect(result).toEqual({ value: { soundEnabled: true }, recovered: true, persistent: true });
    expect(storage.getItem(STORAGE_KEYS.history)).toBe(before);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.settings)!)).toEqual({ version: 1, soundEnabled: true });
  });

  it("keeps a current run in memory when storage is unavailable or throws", () => {
    const throwing = { get length() { return 0; }, clear() { throw new Error("no"); }, getItem() { throw new Error("no"); }, key() { return null; }, removeItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } } as Storage;
    expect(writeRecord(null, HISTORY_RECORD, { runs: [freeRun("memory")] }).persistent).toBe(false);
    expect(readRecord(null, HISTORY_RECORD).value.runs[0].roster[0].cardId).toBe("memory");
    expect(writeRecord(throwing, SETTINGS_RECORD, { soundEnabled: false }).persistent).toBe(false);
    expect(readRecord(throwing, SETTINGS_RECORD).persistent).toBe(false);
  });

  it("does not claim persistence after set fails and a later read is empty", () => {
    const storage: Storage = { get length() { return 0; }, clear() {}, key() { return null; }, removeItem() {}, getItem() { return null; }, setItem() { throw new Error("quota"); } };
    expect(writeRecord(storage, HISTORY_RECORD, { runs: [freeRun("dirty")] }).persistent).toBe(false);
    expect(readRecord(storage, HISTORY_RECORD)).toMatchObject({ persistent: false, value: { runs: [freeRun("dirty")] } });
  });

  it("isolates memory by Storage identity and clears dirty state after a retry", () => {
    let fail = true; let stored: string | null = null; const first: Storage = { get length() { return 0; }, clear() {}, key() { return null; }, removeItem() {}, getItem() { return stored; }, setItem(_key, value) { if (fail) throw new Error("quota"); stored = value; } };
    const second = new MemoryStorage();
    writeRecord(first, HISTORY_RECORD, { runs: [freeRun("first")] });
    expect(readRecord(second, HISTORY_RECORD)).toMatchObject({ persistent: true, value: { runs: [] } });
    expect(readRecord(null, HISTORY_RECORD).value.runs[0]?.roster[0].cardId).not.toBe("first");
    fail = false; expect(writeRecord(first, HISTORY_RECORD, { runs: [freeRun("retry")] }).persistent).toBe(true);
    expect(readRecord(first, HISTORY_RECORD)).toMatchObject({ persistent: true, value: { runs: [freeRun("retry")] } });
  });

  it("treats external removal as authoritative for a clean key", () => {
    const storage = new MemoryStorage(); writeRecord(storage, HISTORY_RECORD, { runs: [freeRun("old")] }); storage.removeItem(STORAGE_KEYS.history);
    expect(readRecord(storage, HISTORY_RECORD)).toEqual({ value: { runs: [] }, recovered: false, persistent: true });
  });

  it("tombstones failed removal until a later retry succeeds", () => {
    let blocked = true; let raw: string | null = JSON.stringify({ version: 1, runs: [freeRun("old")] });
    const storage: Storage = { get length() { return 1; }, clear() {}, key() { return null; }, getItem() { return raw; }, setItem() {}, removeItem() { if (blocked) throw new Error("security"); raw = null; } };
    expect(removeRecord(storage, HISTORY_RECORD)).toMatchObject({ persistent: false, value: { runs: [] } });
    expect(readRecord(storage, HISTORY_RECORD)).toEqual({ value: { runs: [] }, recovered: false, persistent: false });
    blocked = false; expect(removeRecord(storage, HISTORY_RECORD).persistent).toBe(true);
    expect(readRecord(storage, HISTORY_RECORD)).toEqual({ value: { runs: [] }, recovered: false, persistent: true });
  });

  it.each([
    ["duplicate roles", (run: FreePlayRun) => ({ ...run, roster: [...run.roster.slice(0, 4), { role: "sentinel" as const, cardId: "x" }] })],
    ["duplicate cards", (run: FreePlayRun) => ({ ...run, roster: run.roster.map((slot, index) => index === 1 ? { ...slot, cardId: run.roster[0].cardId } : slot) })],
    ["tied series", (run: FreePlayRun) => ({ ...run, series: [{ stage: "group" as const, userWins: 1, opponentWins: 1 }] })],
    ["skipped stage", (run: FreePlayRun) => ({ ...run, stageReached: "semifinal" as const, series: [{ stage: "group" as const, userWins: 2, opponentWins: 0 }, { stage: "semifinal" as const, userWins: 2, opponentWins: 0 }] })],
  ])("rejects malformed stored run: %s", (_, mutate) => {
    expect(() => writeRecord(new MemoryStorage(), HISTORY_RECORD, { runs: [mutate(freeRun("valid")) as FreePlayRun] })).toThrow();
  });

  it("has one trusted Daily completion per UTC date deterministically", () => {
    const value = addDailyCompletion({ completions: [dailyRun("2026-09-05")], streak: 1 }, dailyRun("2026-09-05", "final"));
    expect(value.completions).toHaveLength(1);
    expect(value.completions[0].stageReached).toBe("final");
  });

  it("caps Daily completions at 730 after deduping newest first", () => {
    const distinct = Array.from({ length: 730 }, (_, index) => dailyRun(new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10)));
    const result = addDailyCompletion({ completions: distinct, streak: 0 }, dailyRun("2026-01-01"));
    expect(result.completions).toHaveLength(730); expect(result.completions[0].utcDate).toBe("2026-01-01"); expect(result.completions.at(-1)!.utcDate).not.toBe("2024-01-01"); expect(DAILY_RECORD.schema.safeParse({ version: 1, ...result }).success).toBe(true);
  });

  it("does not accept a Free Play run in Daily completions", () => {
    if (false) {
      // @ts-expect-error Daily storage is statically restricted to Daily runs.
      writeRecord(new MemoryStorage(), DAILY_RECORD, { completions: [freeRun("not-daily")], streak: 0 });
    }
    expect(() => writeRecord(new MemoryStorage(), DAILY_RECORD, { completions: [freeRun("not-daily") as unknown as DailyRun], streak: 0 })).toThrow();
  });

  it("recovers only Daily storage when persisted completions repeat a UTC date", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.daily, JSON.stringify({ version: 1, completions: [dailyRun("2026-09-05"), dailyRun("2026-09-05", "final")], streak: 1 }));
    storage.setItem(STORAGE_KEYS.history, JSON.stringify({ version: 1, runs: [freeRun("intact")] }));
    const history = storage.getItem(STORAGE_KEYS.history);
    expect(readRecord(storage, DAILY_RECORD)).toMatchObject({ recovered: true, persistent: true, value: { completions: [] } });
    expect(storage.getItem(STORAGE_KEYS.history)).toBe(history);
  });

  it("prepends Free Play history newest first and caps it at twenty", () => {
    const result = Array.from({ length: 21 }, (_, index) => freeRun(`r${index}`, `2026-09-${String(index + 1).padStart(2, "0")}`)).reduce<HistoryStorage>((history, run) => prependFreePlayHistory(history, run), { runs: [] });
    expect(result.runs).toHaveLength(20);
    expect(result.runs[0].roster[0].cardId).toBe("r20");
    expect(result.runs.at(-1)!.roster[0].cardId).toBe("r1");
  });

  it("recovers History storage when it contains a Daily run", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.history, JSON.stringify({ version: 1, runs: [dailyRun("2026-09-05")] }));
    expect(readRecord(storage, HISTORY_RECORD)).toMatchObject({ recovered: true, persistent: true, value: { runs: [] } });
  });

  it("returns recovery status for schema migration failure and removes exact keys safely", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.daily, JSON.stringify({ version: 2 }));
    storage.setItem("unrelated", "keep");
    expect(readRecord(storage, DAILY_RECORD)).toMatchObject({ recovered: true, persistent: true });
    expect(storage.getItem("unrelated")).toBe("keep");
    expect(removeRecord(storage, SETTINGS_RECORD).persistent).toBe(true);
    expect(storage.getItem(STORAGE_KEYS.daily)).not.toBeNull();
    const tiny = { key: "throw", schema: z.object({ version: z.literal(1) }), defaultValue: { version: 1 } };
    const blocked: Storage = { get length() { return 0; }, clear() {}, getItem() { return null; }, key() { return null; }, setItem() {}, removeItem() { throw new Error("blocked"); } };
    expect(removeRecord(blocked, tiny).persistent).toBe(false);
  });

  it("rejects calendar-invalid UTC dates", () => {
    expect(() => writeRecord(new MemoryStorage(), HISTORY_RECORD, { runs: [freeRun("invalid", "2026-02-31")] })).toThrow();
  });
});
