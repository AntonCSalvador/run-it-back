import { exec as execShell, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const exec = promisify(execShell);
const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("="))) as NodeJS.ProcessEnv;

async function bundleContains(seedQuery: string): Promise<boolean> {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith(".js") ? [join(directory, entry.name)] : []))).flat();
  };
  const files = await walk(join(process.cwd(), "out"));
  return (await Promise.all(files.map(file => readFile(file, "utf8")))).some(source => source.includes(seedQuery));
}

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") { reject(new Error("Could not reserve an E2E port")); return; }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

test("GitHub Pages build serves navigation and assets below the repository prefix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "Desktop Chrome", "A single serial static-export check avoids rebuilding beneath the Pixel run.");
  expect(await readFile(join(process.cwd(), "next.config.ts"), "utf8")).toContain('process.env.PLAYWRIGHT_TEST_BUILD === "1"');
  const staticRoot = await mkdtemp(join(tmpdir(), "run-it-back-pages-"));
  const port = await unusedPort();
  let server: ReturnType<typeof spawn> | undefined;
  try {
    await exec("npm run build", { env: inheritedEnv, windowsHide: true });
    await expect.poll(() => bundleContains("e2e-seed")).toBe(false);
    await exec("npm run build", { env: { ...inheritedEnv, GITHUB_PAGES: "true", GITHUB_REPOSITORY: "owner/run-it-back", PLAYWRIGHT_TEST_BUILD: "1" }, windowsHide: true });
    await expect.poll(() => bundleContains("e2e-seed")).toBe(true);
    await cp(join(process.cwd(), "out"), join(staticRoot, "run-it-back"), { recursive: true });
    server = spawn(process.execPath, [join(process.cwd(), "node_modules", "serve", "build", "main.js"), staticRoot, "-l", String(port)], { windowsHide: true, stdio: "ignore" });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/run-it-back/`).then(response => response.status).catch(() => 0)).toBe(200);
    await page.goto(`http://127.0.0.1:${port}/run-it-back/`);
    await expect(page.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    const urls = await page.locator('script[src], link[href]').evaluateAll(elements => elements.map(element => element.getAttribute(element.tagName === "SCRIPT" ? "src" : "href")).filter(Boolean));
    expect(urls.filter(url => url!.startsWith("/")).every(url => url!.startsWith("/run-it-back/"))).toBe(true);
  } finally {
    const activeServer = server;
    if (activeServer && !activeServer.killed) {
      await new Promise<void>(resolve => { activeServer.once("exit", () => resolve()); activeServer.kill(); });
    }
    await rm(staticRoot, { recursive: true, force: true });
    await exec("npm run build", { env: { ...inheritedEnv, PLAYWRIGHT_TEST_BUILD: "1" }, windowsHide: true });
  }
});
