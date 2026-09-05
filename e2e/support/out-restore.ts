import { rename, rm, stat } from "node:fs/promises";

export async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }

/** Same-volume rename gives an all-or-nothing backup of a pre-existing export. */
export async function backupOut(out: string, backup: string): Promise<boolean> {
  const hadOut = await exists(out);
  if (hadOut) await rename(out, backup);
  return hadOut;
}

export async function restoreOut(out: string, backup: string, hadOut: boolean): Promise<void> {
  await rm(out, { recursive: true, force: true });
  if (hadOut && await exists(backup)) await rename(backup, out);
}
