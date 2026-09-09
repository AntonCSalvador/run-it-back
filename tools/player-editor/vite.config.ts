import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import snapshot2021 from "../../src/data/champions/2021.json";
import snapshot2022 from "../../src/data/champions/2022.json";
import snapshot2023 from "../../src/data/champions/2023.json";
import snapshot2024 from "../../src/data/champions/2024.json";
import snapshot2025 from "../../src/data/champions/2025.json";
import evidence from "../../src/data/champions/evidence.json";
import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, TeamAppearance } from "@/features/game/domain";

const PLAYER_DATA_PATH = "/api/player-data";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const manualPath = fileURLToPath(new URL("../../src/data/champions/manual-player-data.json", import.meta.url));

const repository = {
  manualPath,
  generatedCards: [
    ...snapshot2021.cards,
    ...snapshot2022.cards,
    ...snapshot2023.cards,
    ...snapshot2024.cards,
    ...snapshot2025.cards,
  ] as PlayerCard[],
  teams: [
    ...snapshot2021.teams,
    ...snapshot2022.teams,
    ...snapshot2023.teams,
    ...snapshot2024.teams,
    ...snapshot2025.teams,
  ] as TeamAppearance[],
  evidence: evidence as Evidence[],
};

function requestHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") result.set(name, value);
    else if (Array.isArray(value)) result.set(name, value.join(", "));
  }
  return result;
}

function readPutBody(request: import("node:http").IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    request.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        tooLarge = true;
        request.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => {
      if (!tooLarge) resolve(Buffer.concat(chunks));
    });
    request.once("error", reject);
  });
}

function playerEditorApiPlugin(): Plugin {
  return {
    name: "player-editor-api",
    configureServer(server) {
      const handler: Promise<(request: Request) => Promise<Response>> = server
        .ssrLoadModule(fileURLToPath(new URL("./server.ts", import.meta.url)))
        .then(module => module.createPlayerDataHandler(repository));

      server.middlewares.use(PLAYER_DATA_PATH, (request, response, next) => {
        const originalUrl = (request as typeof request & { originalUrl?: string }).originalUrl ?? request.url ?? "/";
        if (new URL(originalUrl, "http://127.0.0.1").pathname !== PLAYER_DATA_PATH) {
          next();
          return;
        }

        void (async () => {
          if (request.method === "PUT") {
            const body = await readPutBody(request);
            if (body === null) {
              response.statusCode = 413;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "Request body exceeds 2 MiB" }));
              return;
            }
            const result: Response = await (await handler)(new Request(`http://127.0.0.1${PLAYER_DATA_PATH}`, {
              method: "PUT",
              headers: requestHeaders(request.headers),
              body: body.toString("utf8"),
            }));
            response.statusCode = result.status;
            result.headers.forEach((value, name) => response.setHeader(name, value));
            response.end(Buffer.from(await result.arrayBuffer()));
            return;
          }

          const result: Response = await (await handler)(new Request(`http://127.0.0.1${PLAYER_DATA_PATH}`, {
            method: request.method,
            headers: requestHeaders(request.headers),
          }));
          response.statusCode = result.status;
          result.headers.forEach((value, name) => response.setHeader(name, value));
          response.end(Buffer.from(await result.arrayBuffer()));
        })().catch(error => {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }));
        });
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, ""),
  plugins: [tsconfigPaths(), react(), playerEditorApiPlugin()],
  server: { host: "127.0.0.1", port: 4310, strictPort: true, open: true },
});
