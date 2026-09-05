import { exec as execShell } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { start } from "./support/journey";
import { backupOut, exists, restoreOut } from "./support/out-restore";

const exec = promisify(execShell);
const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("="))) as NodeJS.ProcessEnv;
const mime = new Map([[".html", "text/html"], [".js", "text/javascript"], [".css", "text/css"], [".json", "application/json"], [".svg", "image/svg+xml"], [".png", "image/png"], [".webp", "image/webp"], [".ico", "image/x-icon"]]);

async function treeDigest(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async entry => entry.isDirectory() ? `${entry.name}/${await treeDigest(join(directory, entry.name))}` : `${entry.name}:${createHash("sha256").update(await readFile(join(directory, entry.name))).digest("hex")}`));
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
async function bundleContains(seedQuery: string): Promise<boolean> {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith(".js") ? [join(directory, entry.name)] : []))).flat();
  };
  return (await Promise.all((await walk(join(process.cwd(), "out"))).map(file => readFile(file, "utf8")))).some(source => source.includes(seedQuery));
}

async function listenStatic(root: string): Promise<{ server: Server; origin: string }> {
  const rootPath = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const candidate = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = resolve(rootPath, `.${candidate}`);
      if (file !== rootPath && !file.startsWith(`${rootPath}${sep}`)) { response.writeHead(403).end(); return; }
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const data = await readFile(file);
      response.writeHead(200, { "content-type": mime.get(extname(file)) ?? "application/octet-stream", "content-length": data.length });
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolveListen()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Static E2E server did not bind an address");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

test("GitHub Pages export serves prefixed navigation, data, and every discovered asset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One serial export check avoids rebuilding beneath the Pixel run.");
  expect(await readFile(join(process.cwd(), "next.config.ts"), "utf8")).toContain('process.env.PLAYWRIGHT_TEST_BUILD === "1"');
  const out = join(process.cwd(), "out");
  const staticRoot = await mkdtemp(join(tmpdir(), "run-it-back-pages-"));
  const backupPath = `${out}.e2e-backup-${process.pid}`;
  const hadOut = await exists(out);
  const originalOut = hadOut ? await treeDigest(out) : null;
  let server: Server | undefined;
  try {
    await backupOut(out, backupPath);
    await exec("npm run build", { env: inheritedEnv, windowsHide: true });
    expect(await bundleContains("e2e-seed")).toBe(false);
    await exec("npm run build", { env: { ...inheritedEnv, GITHUB_PAGES: "true", GITHUB_REPOSITORY: "owner/run-it-back", PLAYWRIGHT_TEST_BUILD: "1" }, windowsHide: true });
    expect(await bundleContains("e2e-seed")).toBe(true);
    await cp(out, join(staticRoot, "run-it-back"), { recursive: true });
    const listening = await listenStatic(staticRoot);
    server = listening.server;
    await page.goto(`${listening.origin}/run-it-back/`);
    await expect(page.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    await start(page, "Free Play");
    await expect(page.getByRole("heading", { name: "Choose a team" })).toBeVisible();
    const urls = await page.locator('script[src], link[href], img[src], source[src]').evaluateAll(elements => elements.map(element => element.getAttribute(element.tagName === "LINK" ? "href" : "src")).filter((url): url is string => url !== null && !url.startsWith("data:"))) as string[];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const absolute = new URL(url, listening.origin).toString();
      expect(new URL(absolute).pathname, `asset remains below repository prefix: ${url}`).toMatch(/^\/run-it-back\//);
      const response = await fetch(absolute);
      const bytes = await response.arrayBuffer();
      expect(response.status, `asset response: ${url}`).toBeGreaterThanOrEqual(200);
      expect(response.status, `asset response: ${url}`).toBeLessThan(300);
      expect(response.headers.get("content-type"), `asset content type: ${url}`).toBeTruthy();
      expect(bytes.byteLength, `asset has bytes: ${url}`).toBeGreaterThan(0);
    }
  } finally {
    if (server?.listening) await new Promise<void>((resolveClose, reject) => server!.close(error => error ? reject(error) : resolveClose()));
    expect(server?.listening ?? false, "in-process static server is closed").toBe(false);
    await restoreOut(out, backupPath, hadOut);
    if (originalOut) expect(await treeDigest(out), "out file bytes and layout are restored exactly").toBe(originalOut);
    await rm(staticRoot, { recursive: true, force: true });
    expect(await exists(staticRoot), "temporary static directory is removed").toBe(false);
    expect(await exists(backupPath), "atomic backup directory is consumed").toBe(false);
  }
});
