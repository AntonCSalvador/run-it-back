import { z, type ZodType } from "zod";
import { ROLES, type Role } from "./domain";
import type { Stage } from "./opponents";
import { STAGE_ORDER } from "./tournament";

export const STORAGE_KEYS = { settings: "run-it-back:settings:v1", daily: "run-it-back:daily:v1", history: "run-it-back:history:v1" } as const;

const utcDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split("-").map(Number); const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Invalid UTC date");
const stage = z.enum(["group", "quarterfinal", "semifinal", "final"]);
const rosterSlot = z.object({ role: z.enum(ROLES), cardId: z.string().min(1).max(128) }).strict();
const seriesSummarySchema = z.object({ stage, userWins: z.number().int().nonnegative(), opponentWins: z.number().int().nonnegative() }).strict();
const mapSummarySchema = z.object({ map: z.string().min(1).max(64), userScore: z.number().int().nonnegative(), opponentScore: z.number().int().nonnegative() }).strict();
const persistedSeriesSchema = seriesSummarySchema.extend({ maps: z.array(mapSummarySchema).min(2).max(5).optional() }).strict();
function runIssues(run: { roster: readonly { role: Role; cardId: string }[]; series: readonly { stage: Stage; userWins: number; opponentWins: number }[]; stageReached: Stage; rerollsUsed: number }, context: z.RefinementCtx): void {
  const roles = new Set(run.roster.map(slot => slot.role)); const cards = new Set(run.roster.map(slot => slot.cardId));
  if (roles.size !== ROLES.length || ROLES.some(role => !roles.has(role))) context.addIssue({ code: "custom", path: ["roster"], message: "Roster must include each role exactly once" });
  if (cards.size !== ROLES.length) context.addIssue({ code: "custom", path: ["roster"], message: "Roster card IDs must be unique" });
  if (run.series.length < 1 || run.series.length > STAGE_ORDER.length) context.addIssue({ code: "custom", path: ["series"], message: "Series must contain one to four stages" });
  run.series.forEach((series, index) => {
    if (series.stage !== STAGE_ORDER[index]) context.addIssue({ code: "custom", path: ["series", index, "stage"], message: "Series stages must be ordered without gaps" });
    const needed = series.stage === "final" ? 3 : 2; const otherMax = needed - 1;
    if (!((series.userWins === needed && series.opponentWins <= otherMax) || (series.opponentWins === needed && series.userWins <= otherMax))) context.addIssue({ code: "custom", path: ["series", index], message: "Series summary must be decisive for its stage" });
    if (series.opponentWins === needed && index !== run.series.length - 1) context.addIssue({ code: "custom", path: ["series", index], message: "No series may follow a loss" });
    if (series.userWins === needed && series.stage !== "final" && index === run.series.length - 1) context.addIssue({ code: "custom", path: ["series", index], message: "A winning run must continue to the next stage" });
  });
  if (run.series.at(-1)?.stage !== run.stageReached) context.addIssue({ code: "custom", path: ["stageReached"], message: "Stage reached must match the final series" });
  if (run.rerollsUsed < 0 || run.rerollsUsed > 3) context.addIssue({ code: "custom", path: ["rerollsUsed"], message: "Rerolls must be between zero and three" });
}
const runBaseSchema = z.object({
  completedAtUtc: utcDate,
  stageReached: stage, outcome: z.enum(["champion", "eliminated"]).optional(), series: z.array(persistedSeriesSchema).min(1).max(4),
  rerollsUsed: z.number().int().min(0).max(3), roster: z.array(rosterSlot).length(ROLES.length), iglCardId: z.string().min(1).max(128).optional(),
});
function extendedRunIssues(run: z.infer<typeof runBaseSchema>, context: z.RefinementCtx): void {
  runIssues(run, context);
  if (run.iglCardId && !run.roster.some(slot => slot.cardId === run.iglCardId)) context.addIssue({ code: "custom", path: ["iglCardId"], message: "IGL must be rostered" });
  const final = run.series.at(-1);
  if (run.outcome && final) {
    const champion = final.stage === "final" && final.userWins === 3;
    if ((run.outcome === "champion") !== champion) context.addIssue({ code: "custom", path: ["outcome"], message: "Outcome contradicts final series" });
  }
  run.series.forEach((series, index) => {
    if (!series.maps) return;
    const needed = series.stage === "final" ? 3 : 2;
    if (series.maps.length !== series.userWins + series.opponentWins) context.addIssue({ code: "custom", path: ["series", index, "maps"], message: "Map count must equal series wins" });
    let user = 0; let opponent = 0;
    series.maps.forEach((map, mapIndex) => {
      const valid = (map.userScore === 13 && map.opponentScore <= 11) || (map.opponentScore === 13 && map.userScore <= 11) || (Math.max(map.userScore, map.opponentScore) >= 14 && Math.abs(map.userScore - map.opponentScore) === 2);
      if (!valid || map.userScore === map.opponentScore) context.addIssue({ code: "custom", path: ["series", index, "maps", mapIndex], message: "Invalid decisive map score" });
      if (map.userScore > map.opponentScore) user += 1; else opponent += 1;
      if ((user >= needed || opponent >= needed) && mapIndex < series.maps!.length - 1) context.addIssue({ code: "custom", path: ["series", index, "maps"], message: "Map after clinch" });
    });
    if (user !== series.userWins || opponent !== series.opponentWins) context.addIssue({ code: "custom", path: ["series", index, "maps"], message: "Map wins contradict series" });
  });
}
export const dailyRunSchema = runBaseSchema.extend({ mode: z.literal("daily"), utcDate }).strict().superRefine(extendedRunIssues);
export const freePlayRunSchema = runBaseSchema.extend({ mode: z.literal("free") }).strict().superRefine(extendedRunIssues);
type StoredRunBase = { readonly completedAtUtc: string; readonly stageReached: Stage; readonly outcome?: "champion" | "eliminated"; readonly series: readonly { readonly stage: Stage; readonly userWins: number; readonly opponentWins: number; readonly maps?: readonly { readonly map: string; readonly userScore: number; readonly opponentScore: number }[] }[]; readonly rerollsUsed: number; readonly roster: readonly { readonly role: Role; readonly cardId: string }[]; readonly iglCardId?: string };
export type DailyRun = StoredRunBase & { readonly mode: "daily"; readonly utcDate: string };
export type FreePlayRun = StoredRunBase & { readonly mode: "free" };
export type StoredRunResult = DailyRun | FreePlayRun;
export interface StoredSettings { readonly soundEnabled: boolean }
export interface DailyStorage { readonly completions: readonly DailyRun[]; readonly streak: number }
export interface HistoryStorage { readonly runs: readonly FreePlayRun[] }
export interface RecordAdapter<T> { readonly key: string; readonly schema: ZodType<{ version: 1 } & T>; readonly defaultValue: T }
export interface StorageResult<T> { readonly value: T; readonly recovered: boolean; readonly persistent: boolean }

export const SETTINGS_RECORD: RecordAdapter<StoredSettings> = { key: STORAGE_KEYS.settings, schema: z.object({ version: z.literal(1), soundEnabled: z.boolean() }).strict(), defaultValue: { soundEnabled: true } };
export const DAILY_RECORD: RecordAdapter<DailyStorage> = { key: STORAGE_KEYS.daily, schema: z.object({ version: z.literal(1), completions: z.array(dailyRunSchema).max(730), streak: z.number().int().nonnegative() }).strict().superRefine((value, context) => {
  const dates = new Set<string>();
  value.completions.forEach((run, index) => { if (dates.has(run.utcDate)) context.addIssue({ code: "custom", path: ["completions", index, "utcDate"], message: `Duplicate Daily completion for UTC date ${run.utcDate}` }); dates.add(run.utcDate); });
}), defaultValue: { completions: [], streak: 0 } };
export const HISTORY_RECORD: RecordAdapter<HistoryStorage> = { key: STORAGE_KEYS.history, schema: z.object({ version: z.literal(1), runs: z.array(freePlayRunSchema).max(20) }).strict(), defaultValue: { runs: [] } };

const storageMemory = new WeakMap<Storage, Map<string, unknown>>(); const nullMemory = new Map<string, unknown>(); const dirty = new WeakMap<Storage, Set<string>>(); const tombstones = new WeakMap<Storage, Set<string>>();
function memoryFor(storage: Storage | null): Map<string, unknown> { if (!storage) return nullMemory; const values = storageMemory.get(storage) ?? new Map<string, unknown>(); storageMemory.set(storage, values); return values; }
function dirtyKeys(storage: Storage): Set<string> { const keys = dirty.get(storage) ?? new Set<string>(); dirty.set(storage, keys); return keys; }
function tombstoneKeys(storage: Storage): Set<string> { const keys = tombstones.get(storage) ?? new Set<string>(); tombstones.set(storage, keys); return keys; }
function copy<T>(value: T): T { return structuredClone(value); }
function unwrap<T>(value: { version: 1 } & T): T { const record = copy(value) as { version?: 1 } & T; delete record.version; return record as T; }
function wrap<T>(value: T): { version: 1 } & T { return { version: 1, ...copy(value) }; }

export function readRecord<T>(storage: Storage | null, record: RecordAdapter<T>): StorageResult<T> {
  const memory = memoryFor(storage);
  if (!storage || dirty.get(storage)?.has(record.key) || tombstones.get(storage)?.has(record.key)) return { value: copy((memory.get(record.key) as T | undefined) ?? record.defaultValue), recovered: false, persistent: false };
  let raw: string | null;
  try { raw = storage.getItem(record.key); } catch { return { value: copy((memory.get(record.key) as T | undefined) ?? record.defaultValue), recovered: false, persistent: false }; }
  if (raw === null) { memory.delete(record.key); return { value: copy(record.defaultValue), recovered: false, persistent: true }; }
  try {
    const parsed = record.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("Invalid storage schema");
    const value = unwrap(parsed.data); memory.set(record.key, copy(value)); dirtyKeys(storage).delete(record.key);
    return { value: copy(value), recovered: false, persistent: true };
  } catch {
    const value = copy(record.defaultValue); memory.set(record.key, copy(value));
    try { storage.setItem(record.key, JSON.stringify(wrap(value))); return { value, recovered: true, persistent: true }; }
    catch { return { value, recovered: true, persistent: false }; }
  }
}

export function writeRecord<T>(storage: Storage | null, record: RecordAdapter<T>, value: T): StorageResult<T> {
  const parsed = record.schema.safeParse(wrap(value));
  if (!parsed.success) throw new Error(`Cannot persist invalid ${record.key}`);
  const safe = unwrap(parsed.data); memoryFor(storage).set(record.key, copy(safe));
  if (!storage) return { value: copy(safe), recovered: false, persistent: false };
  try { storage.setItem(record.key, JSON.stringify(wrap(safe))); dirtyKeys(storage).delete(record.key); tombstoneKeys(storage).delete(record.key); return { value: copy(safe), recovered: false, persistent: true }; }
  catch { dirtyKeys(storage).add(record.key); return { value: copy(safe), recovered: false, persistent: false }; }
}

export function removeRecord<T>(storage: Storage | null, record: RecordAdapter<T>): StorageResult<T> {
  const memory = memoryFor(storage);
  if (!storage) { memory.delete(record.key); return { value: copy(record.defaultValue), recovered: false, persistent: false }; }
  try { storage.removeItem(record.key); memory.delete(record.key); dirtyKeys(storage).delete(record.key); tombstoneKeys(storage).delete(record.key); return { value: copy(record.defaultValue), recovered: false, persistent: true }; }
  catch { memory.set(record.key, copy(record.defaultValue)); dirtyKeys(storage).add(record.key); tombstoneKeys(storage).add(record.key); return { value: copy(record.defaultValue), recovered: false, persistent: false }; }
}

export function addDailyCompletion(current: DailyStorage, completion: DailyRun): DailyStorage {
  const withoutDate = current.completions.filter(run => run.utcDate !== completion.utcDate);
  return { completions: [copy(completion), ...withoutDate].slice(0, 730), streak: current.streak };
}
/** UTC-only streak calculation; older submissions never rewrite the latest streak. */
export function nextDailyStreak(completions: readonly DailyRun[], utcDate: string, currentStreak: number): number {
  const dates = completions.map(run => run.utcDate).sort();
  const latest = dates.at(-1);
  if (!latest || utcDate === latest) return latest ? currentStreak || 1 : 1;
  if (utcDate < latest) return currentStreak;
  const previous = new Date(`${latest}T00:00:00.000Z`).getTime();
  const next = new Date(`${utcDate}T00:00:00.000Z`).getTime();
  return next - previous === 86_400_000 ? currentStreak + 1 : 1;
}
export function prependFreePlayHistory(current: HistoryStorage, run: FreePlayRun): HistoryStorage {
  return { runs: [copy(run), ...current.runs].slice(0, 20) };
}
