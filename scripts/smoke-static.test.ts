import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("smoke-static CLI", () => {
  it("reports a useful error when index.html is absent", () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), "run-it-back-smoke-"));
    try {
      const result = spawnSync(process.execPath, [require.resolve("tsx/cli"), "scripts/smoke-static.mts", outputDirectory], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("index.html missing");
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
