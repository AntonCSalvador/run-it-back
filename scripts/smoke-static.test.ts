import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest loads the executable .mts module through Vite.
import { smokeStatic } from "./smoke-static.mts";

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [require.resolve("tsx/cli"), "scripts/smoke-static.mts", ...args], { encoding: "utf8" });
}

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), "run-it-back-smoke-"));
  mkdirSync(join(root, "out"), { recursive: true });
  mkdirSync(join(root, "src", "data", "champions"), { recursive: true });
  writeFileSync(join(root, "src", "data", "champions", "2021.json"), JSON.stringify({ teams: [], players: [] }));
  return root;
}

describe("smoke-static CLI", () => {
  it("reports a useful error when index.html is absent", () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), "run-it-back-smoke-"));
    try {
      const result = runCli(outputDirectory);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("index.html missing");
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    ["--base-path"],
    ["--base-path", "--other"],
    ["--base-path=/one", "--base-path=/two"],
    ["first", "second"],
    ["--unknown"],
  ])("rejects malformed arguments %j", (...args: string[]) => {
    const result = runCli(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error:");
    expect(result.stderr).toContain("usage: smoke-static");
  });
});

describe("smokeStatic", () => {
  it("checks stylesheet relations case-insensitively", () => {
    const root = temporaryProject();
    try {
      writeFileSync(join(root, "out", "index.html"), '<link rel="preload StyleSheet" href="/style.css">');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("/style.css");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses local pathnames when references have query strings and fragments", () => {
    const root = temporaryProject();
    try {
      mkdirSync(join(root, "out", "_next"), { recursive: true });
      writeFileSync(join(root, "out", "index.html"), '<script src="/run-it-back/_next/a.js?v=1#x"></script><link rel="stylesheet" href="/run-it-back/style.css?x"><link rel="stylesheet" href="./relative.css?x">');
      writeFileSync(join(root, "out", "_next", "a.js"), "");
      writeFileSync(join(root, "out", "style.css"), "");
      writeFileSync(join(root, "out", "relative.css"), "");
      expect(smokeStatic(join(root, "out"), { projectRoot: root, basePath: "/run-it-back" })).toMatchObject({ references: 3 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects encoded traversal and base-prefix escapes", () => {
    const root = temporaryProject();
    try {
      writeFileSync(join(root, "out", "index.html"), '<script src="/run-it-back/%2e%2e/escape.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root, basePath: "/run-it-back" })).toThrow("invalid local reference");
      writeFileSync(join(root, "out", "index.html"), '<script src="/run-it-backish/escape.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root, basePath: "/run-it-back" })).toThrow("outside base path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects empty dataset asset values", () => {
    const root = temporaryProject();
    try {
      writeFileSync(join(root, "src", "data", "champions", "2021.json"), JSON.stringify({ teams: [{ logo: "" }], players: [{ portrait: null }] }));
      writeFileSync(join(root, "out", "index.html"), "");
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow('invalid dataset asset ""');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
