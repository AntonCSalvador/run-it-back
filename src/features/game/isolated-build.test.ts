// @vitest-environment node
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createIsolatedProject, runNode } from "../../../e2e/support/isolated-build";

it("keeps the live export readable throughout an isolated build and cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "run-it-back-isolation-"));
  const server = createServer(async (_request, response) => {
    try { response.end(await readFile(join(root, "out", "index.html"))); }
    catch { response.writeHead(404).end(); }
  });
  try {
    for (const dir of ["src", "scripts", "out", "node_modules", ".next"]) await mkdir(join(root, dir));
    for (const file of ["package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json"]) await writeFile(join(root, file), "{}");
    await writeFile(join(root, "src", "app.ts"), "original source");
    await writeFile(join(root, "src", "app.test.ts"), "test-only imports");
    await writeFile(join(root, "out", "index.html"), "live app");
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server failed to bind");
    const url = `http://127.0.0.1:${address.port}`;
    const isolated = await createIsolatedProject(root);
    try {
      expect(await readFile(join(isolated.root, "src", "app.ts"), "utf8")).toBe("original source");
      expect(await readdir(join(isolated.root, "src"))).not.toContain("app.test.ts");
      expect(await readdir(isolated.root)).not.toContain("node_modules");
      expect(await readdir(isolated.root)).not.toContain("out");
      expect(await readdir(isolated.root)).not.toContain(".next");
      await mkdir(join(isolated.root, "out"));
      await writeFile(join(isolated.root, "out", "index.html"), "Pages app");
      expect(await (await fetch(url)).text()).toBe("live app");
    } finally { await isolated.cleanup(); }
    expect(await (await fetch(url)).text()).toBe("live app");
    expect(await readdir(root)).not.toContain(isolated.root.split(/[\\/]/).at(-1));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

it("reports command failures and terminates timed-out commands", async () => {
  await expect(runNode(["-e", "console.error('build failed'); process.exit(7)"], process.cwd(), process.env)).rejects.toThrow(/exited 7.*[\s\S]*build failed/);
  await expect(runNode(["-e", "setInterval(() => {}, 1000)"], process.cwd(), process.env, 100)).rejects.toThrow("timed out");
});
