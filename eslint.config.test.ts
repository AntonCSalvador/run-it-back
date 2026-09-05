import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace boundaries", () => {
  it("ignores linked worktrees beneath the primary checkout", () => {
    const config = readFileSync(resolve(process.cwd(), "eslint.config.mjs"), "utf8");
    expect(config).toMatch(/globalIgnores\(\s*\[[\s\S]*?["']\.worktrees\/\*\*["']/);
  });

  it("keeps linked worktrees outside Vitest discovery", () => {
    const config = readFileSync(resolve(process.cwd(), "vitest.config.mts"), "utf8");
    expect(config).toMatch(/exclude:\s*\[[\s\S]*?["']\.worktrees\/\*\*["']/);
  });
});
