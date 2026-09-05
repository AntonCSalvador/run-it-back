import { z, type ZodType } from "zod";
import { ROLES, type Role } from "./domain";
import type { Stage } from "./opponents";

export const STORAGE_KEYS = { settings: "run-it-back:settings:v1", daily: "run-it-back:daily:v1", history: "run-it-back:history:v1" } as const;

const utcDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split("-").map(Number); const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Invalid UTC date");
const stage = z.enum(["group", "quarterfinal", "semifinal", "final"]);
const rosterSlot = z.object({ role: z.enum(ROLES), cardId: z.string().min(1) }).strict();
const runBaseSchema = z.object({
  completedAtUtc: utcDate,
  stageReached: stage, series: z.array(z.object({ stage, userWins: z.number().int().nonnegative(), opponentWins: z.number().int().nonnegative() }).strict()),
  rerollsUsed: z.number().int().nonnegative(), roster: z.array(rosterSlot).length(ROLES.length),
});
const dailyRunSchema = runBaseSchema.extend({ mode: z.literal("daily"), utcDate }).strict();
const freePlayRunSchema = runBaseSchema.extend({ mode: z.literal("free") }).strict();
type StoredRunBase = { readonly completedAtUtc: string; readonly stageReached: Stage; readonly series: readonly { readonly stage: Stage; readonly userWins: number; readonly opponentWins: number }[]; readonly rerollsUsed: number; readonly roster: readonly { readonly role: Role; readonly cardId: string }[] };
export type DailyRun = StoredRunBase & { readonly mode: "daily"; readonly utcDate: string };
export type FreePlayRun = StoredRunBase & { readonly mode: "free" };
export type StoredRunResult = DailyRun | FreePlayRun;
export interface StoredSettings { readonly soundEnabled: boolean }
export interface DailyStorage { readonly completions: readonly DailyRun[]; readonly streak: number }
export interface HistoryStorage { readonly runs: readonly FreePlayRun[] }
export interface RecordAdapter<T> { readonly key: string; readonly schema: ZodType<{ version: 1 } & T>; readonly defaultValue: T }
export interface StorageResult<T> { readonly value: T; readonly recovered: boolean; readonly persistent: boolean }

export const SETTINGS_RECORD: RecordAdapter<StoredSettings> = { key: STORAGE_KEYS.settings, schema: z.object({ version: z.literal(1), soundEnabled: z.boolean() }).strict(), defaultValue: { soundEnabled: true } };
export const DAILY_RECORD: RecordAdapter<DailyStorage> = { key: STORAGE_KEYS.daily, schema: z.object({ version: z.literal(1), completions: z.array(dailyRunSchema), streak: z.number().int().nonnegative() }).strict().superRefine((value, context) => {
  const dates = new Set<string>();
  value.completions.forEach((run, index) => { if (dates.has(run.utcDate)) context.addIssue({ code: "custom", path: ["completions", index, "utcDate"], message: `Duplicate Daily completion for UTC date ${run.utcDate}` }); dates.add(run.utcDate); });
}), defaultValue: { completions: [], streak: 0 } };
export const HISTORY_RECORD: RecordAdapter<HistoryStorage> = { key: STORAGE_KEYS.history, schema: z.object({ version: z.literal(1), runs: z.array(freePlayRunSchema).max(20) }).strict(), defaultValue: { runs: [] } };

const memory = new Map<string, unknown>();
function copy<T>(value: T): T { return structuredClone(value); }
function unwrap<T>(value: { version: 1 } & T): T { const record = copy(value) as { version?: 1 } & T; delete record.version; return record as T; }
function wrap<T>(value: T): { version: 1 } & T { return { version: 1, ...copy(value) }; }

export function readRecord<T>(storage: Storage | null, record: RecordAdapter<T>): StorageResult<T> {
  if (!storage) return { value: copy((memory.get(record.key) as T | undefined) ?? record.defaultValue), recovered: false, persistent: false };
  let raw: string | null;
  try { raw = storage.getItem(record.key); } catch { return { value: copy((memory.get(record.key) as T | undefined) ?? record.defaultValue), recovered: false, persistent: false }; }
  if (raw === null) return { value: copy((memory.get(record.key) as T | undefined) ?? record.defaultValue), recovered: false, persistent: true };
  try {
    const parsed = record.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("Invalid storage schema");
    const value = unwrap(parsed.data); memory.set(record.key, copy(value));
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
  const safe = unwrap(parsed.data); memory.set(record.key, copy(safe));
  if (!storage) return { value: copy(safe), recovered: false, persistent: false };
  try { storage.setItem(record.key, JSON.stringify(wrap(safe))); return { value: copy(safe), recovered: false, persistent: true }; }
  catch { return { value: copy(safe), recovered: false, persistent: false }; }
}

export function removeRecord<T>(storage: Storage | null, record: RecordAdapter<T>): StorageResult<T> {
  memory.delete(record.key);
  if (!storage) return { value: copy(record.defaultValue), recovered: false, persistent: false };
  try { storage.removeItem(record.key); return { value: copy(record.defaultValue), recovered: false, persistent: true }; }
  catch { return { value: copy(record.defaultValue), recovered: false, persistent: false }; }
}

export function addDailyCompletion(current: DailyStorage, completion: DailyRun): DailyStorage {
  const withoutDate = current.completions.filter(run => run.utcDate !== completion.utcDate);
  return { completions: [copy(completion), ...withoutDate], streak: current.streak };
}
export function prependFreePlayHistory(current: HistoryStorage, run: FreePlayRun): HistoryStorage {
  return { runs: [copy(run), ...current.runs].slice(0, 20) };
}
