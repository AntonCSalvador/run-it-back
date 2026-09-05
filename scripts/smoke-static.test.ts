import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function linkDirectory(target: string, path: string) {
  symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
}

function supportsFileSymlinks() {
  const root = mkdtempSync(join(tmpdir(), "run-it-back-link-capability-"));
  try {
    writeFileSync(join(root, "target"), "x");
    symlinkSync(join(root, "target"), join(root, "link"), "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const fileSymlinkTest = supportsFileSymlinks() ? it : it.skip;

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

  it("prints help without running smoke", () => {
    const result = runCli("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("usage: smoke-static");
    expect(result.stderr).toBe("");
  });

  it("rejects help combined with other arguments", () => {
    const result = runCli("--help", "out");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error:");
    expect(result.stderr).toContain("usage: smoke-static");
  });

  it("prints usage for an invalid base path", () => {
    const result = runCli("--base-path", "invalid");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error: invalid base path");
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

  it("rejects a referenced directory", () => {
    const root = temporaryProject();
    try {
      mkdirSync(join(root, "out", "app.js"));
      writeFileSync(join(root, "out", "index.html"), '<script src="/app.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("not a regular file");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  fileSymlinkTest("rejects a referenced symlink file", () => {
    const root = temporaryProject();
    const outside = mkdtempSync(join(tmpdir(), "run-it-back-outside-"));
    try {
      writeFileSync(join(outside, "app.js"), "outside");
      symlinkSync(join(outside, "app.js"), join(root, "out", "app.js"), "file");
      writeFileSync(join(root, "out", "index.html"), '<script src="/app.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("symlink");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a referenced file through an escaping directory link", () => {
    const root = temporaryProject();
    const outside = mkdtempSync(join(tmpdir(), "run-it-back-outside-"));
    try {
      writeFileSync(join(outside, "app.js"), "outside");
      linkDirectory(outside, join(root, "out", "nested"));
      writeFileSync(join(root, "out", "index.html"), '<script src="/nested/app.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("resolves outside");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
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

  it("ignores external URL metadata and local URL metadata after separating the pathname", () => {
    const root = temporaryProject();
    try {
      writeFileSync(join(root, "out", "index.html"), '<script src="/app.js#\\"></script><script src="https://cdn.example/app.js?x=\\"></script><script src="//cdn.example/app.js?x=\\"></script><script src="data:text/javascript,\\"></script>');
      writeFileSync(join(root, "out", "app.js"), "");
      expect(smokeStatic(join(root, "out"), { projectRoot: root })).toMatchObject({ references: 4 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects literal and encoded backslashes in local pathnames", () => {
    const root = temporaryProject();
    try {
      writeFileSync(join(root, "out", "index.html"), '<script src="/app\\bad.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("invalid local reference");
      writeFileSync(join(root, "out", "index.html"), '<script src="/app%5Cbad.js"></script>');
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("invalid local reference");
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

  it("uses decoded asset pathnames for public and exported files", () => {
    const root = temporaryProject();
    try {
      mkdirSync(join(root, "public", "assets"), { recursive: true });
      mkdirSync(join(root, "out", "assets"), { recursive: true });
      writeFileSync(join(root, "public", "assets", "team logo.svg"), "source");
      writeFileSync(join(root, "out", "assets", "team logo.svg"), "exported");
      writeFileSync(join(root, "src", "data", "champions", "2021.json"), JSON.stringify({ teams: [{ logo: "/assets/team%20logo.svg?version=1#credit" }], players: [] }));
      writeFileSync(join(root, "out", "index.html"), "");
      expect(smokeStatic(join(root, "out"), { projectRoot: root, basePath: "/run-it-back" })).toMatchObject({ assets: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects encoded traversal in dataset asset paths", () => {
    const root = temporaryProject();
    try {
      writeFileSync(join(root, "src", "data", "champions", "2021.json"), JSON.stringify({ teams: [{ logo: "/assets/%2e%2e/escape.svg" }], players: [] }));
      writeFileSync(join(root, "out", "index.html"), "");
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("invalid local reference");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  fileSymlinkTest("rejects symlinked public and exported dataset assets", () => {
    const root = temporaryProject();
    const outside = mkdtempSync(join(tmpdir(), "run-it-back-outside-"));
    try {
      mkdirSync(join(root, "public", "assets"), { recursive: true });
      mkdirSync(join(root, "out", "assets"), { recursive: true });
      writeFileSync(join(outside, "asset.svg"), "outside");
      symlinkSync(join(outside, "asset.svg"), join(root, "public", "assets", "asset.svg"), "file");
      writeFileSync(join(root, "out", "assets", "asset.svg"), "exported");
      writeFileSync(join(root, "src", "data", "champions", "2021.json"), JSON.stringify({ teams: [{ logo: "/assets/asset.svg" }], players: [] }));
      writeFileSync(join(root, "out", "index.html"), "");
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("symlink");
      rmSync(join(root, "public", "assets", "asset.svg"));
      writeFileSync(join(root, "public", "assets", "asset.svg"), "source");
      rmSync(join(root, "out", "assets", "asset.svg"));
      symlinkSync(join(outside, "asset.svg"), join(root, "out", "assets", "asset.svg"), "file");
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("symlink");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects public and exported assets reached through escaping directory junctions", () => {
    const root = temporaryProject();
    const outside = mkdtempSync(join(tmpdir(), "run-it-back-outside-"));
    try {
      mkdirSync(join(root, "public"), { recursive: true });
      mkdirSync(join(root, "out", "assets"), { recursive: true });
      writeFileSync(join(outside, "asset.svg"), "outside");
      linkDirectory(outside, join(root, "public", "assets"));
      writeFileSync(join(root, "out", "assets", "asset.svg"), "exported");
      writeFileSync(join(root, "src", "data", "champions", "2021.json"), JSON.stringify({ teams: [{ logo: "/assets/asset.svg" }], players: [] }));
      writeFileSync(join(root, "out", "index.html"), "");
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("resolves outside public directory");
      rmSync(join(root, "public", "assets"), { recursive: true, force: true });
      mkdirSync(join(root, "public", "assets"));
      writeFileSync(join(root, "public", "assets", "asset.svg"), "source");
      rmSync(join(root, "out", "assets"), { recursive: true, force: true });
      linkDirectory(outside, join(root, "out", "assets"));
      expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("resolves outside output directory");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
