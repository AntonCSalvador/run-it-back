// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Plugin, UserConfig, ViteDevServer } from "vite";
import config from "./vite.config";

describe("local player editor startup", () => {
  it("binds to loopback, opens the browser, and mounts the React entry", () => {
    const resolved = config as UserConfig;
    const pluginNames = ((resolved.plugins ?? []) as unknown[])
      .flatMap(plugin => Array.isArray(plugin) ? plugin : [plugin])
      .filter((plugin): plugin is Plugin => Boolean(plugin))
      .map(plugin => plugin.name);

    expect(resolved).toMatchObject({
      root: expect.stringMatching(/tools[\\/]player-editor$/),
      server: { host: "127.0.0.1", port: 4310, strictPort: true, open: true },
    });
    expect(pluginNames).toContain("player-editor-api");
    expect(pluginNames.some(name => name.startsWith("vite:react"))).toBe(true);
    expect(pluginNames).toContain("vite-tsconfig-paths");
    const html = readFileSync("tools/player-editor/index.html", "utf8");
    expect(html).toContain("<title>Run It Back · Local Player Editor</title>");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/src/main.tsx"');
  });

  it("passes non-exact API paths to the next middleware", () => {
    const plugin = (config as UserConfig).plugins as Plugin[];
    const apiPlugin = plugin.find(candidate => candidate.name === "player-editor-api")!;
    let middleware!: (request: { method?: string; url?: string; originalUrl?: string; headers: Record<string, string | string[] | undefined> }, response: object, next: () => void) => void;
    const server = {
      middlewares: {
        use: (_path: string, handler: typeof middleware) => { middleware = handler; },
      },
      ssrLoadModule: vi.fn().mockResolvedValue({ createPlayerDataHandler: () => async () => new Response() }),
    } as unknown as ViteDevServer;
    const next = vi.fn();
    const response = { setHeader: vi.fn(), end: vi.fn() };

    if (typeof apiPlugin.configureServer !== "function") throw new Error("player editor API must configure the server");
    apiPlugin.configureServer.call({} as never, server);
    middleware({ method: "GET", url: "/extra", originalUrl: "/api/player-data/extra", headers: {} }, response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
