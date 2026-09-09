import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  parseManualCatalog,
  type ManualPlayerCatalog,
} from "@/data/champions/manual-data";
import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, TeamAppearance } from "@/features/game/domain";
import { TRAIT_WEIGHTS } from "@/features/game/rating";

const PLAYER_DATA_PATH = "/api/player-data";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const saveLocks = new Map<string, Promise<void>>();

export interface PlayerEditorRepository {
  manualPath: string;
  generatedCards: PlayerCard[];
  teams: TeamAppearance[];
  evidence: Evidence[];
}

export class PlayerEditorHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PlayerEditorHttpError";
  }
}

export const fileRevision = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

function sortedCards(repository: PlayerEditorRepository): PlayerCard[] {
  return [...repository.generatedCards].sort((left, right) => left.id.localeCompare(right.id));
}

function expectedIds(repository: PlayerEditorRepository): string[] {
  return sortedCards(repository).map(card => card.id);
}

async function withSaveLock<T>(manualPath: string, operation: () => Promise<T>): Promise<T> {
  const previous = saveLocks.get(manualPath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => current);
  saveLocks.set(manualPath, tail);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (saveLocks.get(manualPath) === tail) saveLocks.delete(manualPath);
  }
}

export async function readEditorDocument(repository: PlayerEditorRepository) {
  const text = await readFile(repository.manualPath, "utf8");
  const catalog = parseManualCatalog(JSON.parse(text), expectedIds(repository));
  const manualCards = new Map(catalog.cards.map(card => [card.cardId, card]));
  const evidence = new Map(repository.evidence.map(row => [row.cardId, row]));
  const teams = new Map(repository.teams.map(team => [team.id, team]));

  for (const card of repository.generatedCards) {
    if (!evidence.has(card.id)) throw new Error(`Missing evidence for ${card.id}`);
    if (!teams.has(card.teamId)) throw new Error(`Missing team for ${card.id}`);
  }

  return {
    revision: fileRevision(text),
    traitWeights: TRAIT_WEIGHTS,
    cards: sortedCards(repository).map(card => ({
      generated: card,
      manual: manualCards.get(card.id)!,
      evidence: evidence.get(card.id)!,
      team: teams.get(card.teamId)!,
    })),
  };
}

type Replace = (oldPath: string, newPath: string) => Promise<void>;

export async function saveManualCatalog(
  repository: PlayerEditorRepository,
  expectedRevision: string,
  input: unknown,
  operations: { replace: Replace } = { replace: rename },
) {
  return withSaveLock(repository.manualPath, async () => {
    const current = await readFile(repository.manualPath, "utf8");
    if (fileRevision(current) !== expectedRevision) {
      throw new PlayerEditorHttpError(409, "Player data changed on disk; reload before saving");
    }

    let catalog: ManualPlayerCatalog;
    try {
      catalog = parseManualCatalog(input, expectedIds(repository));
    } catch (error) {
      throw new PlayerEditorHttpError(400, error instanceof Error ? error.message : String(error));
    }

    const formatted = `${JSON.stringify(catalog, null, 2)}\n`;
    const temporaryPath = `${repository.manualPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, formatted, { encoding: "utf8", flag: "wx" });
      await operations.replace(temporaryPath, repository.manualPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }

    return { revision: fileRevision(formatted) };
  });
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(error: unknown): Response {
  if (error instanceof PlayerEditorHttpError) {
    return json({ error: error.message }, { status: error.status });
  }
  return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
}

function parseSaveRequest(text: string): { revision: string; catalog: unknown } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new PlayerEditorHttpError(400, "Request body must be valid JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PlayerEditorHttpError(400, "Request body must be an object with revision and catalog");
  }
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("revision") || !keys.includes("catalog")) {
    throw new PlayerEditorHttpError(400, "Request body must contain only revision and catalog");
  }
  const { revision, catalog } = body as Record<string, unknown>;
  if (typeof revision !== "string") {
    throw new PlayerEditorHttpError(400, "revision must be a string");
  }
  return { revision, catalog };
}

export function createPlayerDataHandler(repository: PlayerEditorRepository): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== PLAYER_DATA_PATH) {
      return new Response(null, { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "PUT") {
      return new Response(null, { status: 405, headers: { Allow: "GET, PUT" } });
    }

    try {
      if (request.method === "GET") {
        return json(await readEditorDocument(repository));
      }

      const text = await request.text();
      if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
        throw new PlayerEditorHttpError(413, "Request body exceeds 2 MiB");
      }
      const { revision, catalog } = parseSaveRequest(text);
      return json(await saveManualCatalog(repository, revision, catalog));
    } catch (error) {
      return errorResponse(error);
    }
  };
}
