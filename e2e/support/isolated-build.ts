import { execFile, spawn } from "node:child_process";
import { cp, lstat, mkdtemp, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const buildInputs = ["src", "public", "scripts", "package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json"];

/** Copies build inputs only. The live export and dependencies are never moved. */
export async function createIsolatedProject(projectRoot: string): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const parent = resolve(projectRoot);
  const root = await mkdtemp(join(parent, ".e2e-build-"));
  const cleanup = async () => {
    if (dirname(root) !== parent || !basename(root).startsWith(".e2e-build-")) throw new Error("Unsafe isolated build cleanup path");
    await rm(root, { recursive: true, force: true });
  };
  try {
    for (const input of buildInputs) {
      const source = join(parent, input);
      try { await lstat(source); } catch (error) {
        if (input === "public" && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      await cp(source, join(root, input), { recursive: true, filter: async path => {
        if ((await lstat(path)).isSymbolicLink()) throw new Error(`Build input must not be a symlink: ${path}`);
        return !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
      } });
    }
    return { root, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

/** Direct Node invocation avoids npm.cmd/shell quoting and terminates the full tree on timeout. */
export async function runNode(args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs = 120_000): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    let termination: Promise<unknown> | undefined;
    const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-1_000_000); };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timeout = setTimeout(() => {
      timedOut = true;
      if (!child.pid) return;
      if (process.platform === "win32") termination = promisify(execFile)("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => child.kill());
      else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    }, timeoutMs);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", async code => {
      clearTimeout(timeout);
      await termination;
      if (timedOut || code !== 0) reject(new Error(`Node command ${timedOut ? "timed out" : `exited ${code}`}: ${args.join(" ")}\n${output}`));
      else resolveRun();
    });
  });
}
