import { createHash } from "node:crypto";
import { cp, readFile, readdir, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { start } from "./support/journey";
import { createIsolatedProject, runNode } from "./support/isolated-build";
import { championsDataset } from "../src/data/champions";

const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("="))) as NodeJS.ProcessEnv;
const mime = new Map([[".html", "text/html"], [".js", "text/javascript"], [".css", "text/css"], [".json", "application/json"], [".svg", "image/svg+xml"], [".png", "image/png"], [".webp", "image/webp"], [".ico", "image/x-icon"]]);

async function treeDigest(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async entry => entry.isDirectory() ? `${entry.name}/${await treeDigest(join(directory, entry.name))}` : `${entry.name}:${createHash("sha256").update(await readFile(join(directory, entry.name))).digest("hex")}`));
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
async function bundleContains(out: string, seedQuery: string): Promise<boolean> {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith(".js") ? [join(directory, entry.name)] : []))).flat();
  };
  return (await Promise.all((await walk(out)).map(file => readFile(file, "utf8")))).some(source => source.includes(seedQuery));
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

test("GitHub Pages export serves prefixed navigation, data, and every discovered asset", async ({ page, request, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One isolated export check covers both viewport projects.");
  test.setTimeout(300_000);
  expect(await readFile(join(process.cwd(), "next.config.ts"), "utf8")).toContain('process.env.PLAYWRIGHT_TEST_BUILD === "1"');
  const out = join(process.cwd(), "out");
  const originalOut = await treeDigest(out);
  const isolated = await createIsolatedProject(process.cwd());
  const isolatedOut = join(isolated.root, "out");
  const staticRoot = join(isolated.root, "site");
  const normalEnv = { ...inheritedEnv, PLAYWRIGHT_TEST_BUILD: "0", GITHUB_PAGES: "false" };
  const build = async (env: NodeJS.ProcessEnv) => {
    await runNode([join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), "scripts/validate-data.mts"], isolated.root, env, 15_000);
    await runNode([join(process.cwd(), "node_modules/next/dist/bin/next"), "build"], isolated.root, env, 90_000);
    expect(await treeDigest(out), "main export is untouched during isolated builds").toBe(originalOut);
    expect((await request.get(baseURL!)).status(), "main server remains live during isolated builds").toBe(200);
  };
  let server: Server | undefined;
  try {
    await build(normalEnv);
    expect(await bundleContains(isolatedOut, "e2e-seed")).toBe(false);
    await build({ ...normalEnv, GITHUB_PAGES: "true", GITHUB_REPOSITORY: "AntonCSalvador/run-it-back", PLAYWRIGHT_TEST_BUILD: "1" });
    expect(await bundleContains(isolatedOut, "e2e-seed")).toBe(true);
    // The bundled data must be present in the served JS, not merely the source tree.
    expect(await bundleContains(isolatedOut, championsDataset.cards[0].id)).toBe(true);
    expect(await bundleContains(isolatedOut, championsDataset.cards.at(-1)!.id)).toBe(true);
    await cp(isolatedOut, join(staticRoot, "run-it-back"), { recursive: true });
    const listening = await listenStatic(staticRoot);
    server = listening.server;
    await page.goto(`${listening.origin}/run-it-back/`);
    await expect(page.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    await start(page, "Free Play");
    await expect(page.getByRole("heading", { name: "Choose a team" })).toBeVisible();
    await page.locator(".team-card").first().click();
    await expect(page.locator('[data-testid^="player-card-"]').first()).toBeVisible();
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
      const expectedType = mime.get(extname(new URL(absolute).pathname));
      if (expectedType) expect(response.headers.get("content-type")).toContain(expectedType);
      expect(bytes.byteLength, `asset has bytes: ${url}`).toBeGreaterThan(0);
    }
  } finally {
    if (server?.listening) await new Promise<void>((resolveClose, reject) => server!.close(error => error ? reject(error) : resolveClose()));
    expect(server?.listening ?? false, "in-process static server is closed").toBe(false);
    await isolated.cleanup();
    expect(await treeDigest(out), "main export bytes and layout never changed").toBe(originalOut);
    const mainResponse = await request.get(baseURL!);
    expect(mainResponse.status(), "main web server survives static test teardown").toBe(200);
    expect(await mainResponse.text()).toContain("Run It Back");
    await expect(stat(isolated.root)).rejects.toMatchObject({ code: "ENOENT" });
  }
});
