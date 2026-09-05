import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupOut, exists, restoreOut } from "../../../e2e/support/out-restore";

const digest = async (path: string) => createHash("sha256").update(await readFile(join(path, "nested", "known.txt"))).digest("hex");
describe("atomic static export restoration", () => {
  it("restores the exact original tree after a generated out failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "run-it-back-restore-")); const out = join(root, "out"); const backup = join(root, "out.backup");
    try { await mkdir(join(out, "nested"), { recursive: true }); await writeFile(join(out, "nested", "known.txt"), "original"); const before = await digest(out); const hadOut = await backupOut(out, backup); await mkdir(join(out, "nested"), { recursive: true }); await writeFile(join(out, "nested", "known.txt"), "partial"); await restoreOut(out, backup, hadOut); expect(await digest(out)).toBe(before); expect(await exists(backup)).toBe(false); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
});
