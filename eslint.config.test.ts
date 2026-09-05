import eslintConfig from "./eslint.config.mjs";
import { describe, expect, it } from "vitest";

describe("ESLint workspace boundaries", () => {
  it("ignores linked worktrees beneath the primary checkout", () => {
    const globalIgnorePatterns = eslintConfig.flatMap(entry =>
      Array.isArray(entry.ignores) ? entry.ignores : [],
    );

    expect(globalIgnorePatterns).toContain(".worktrees/**");
  });
});
