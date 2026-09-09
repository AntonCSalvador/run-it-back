import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { assessPortrait, choosePortrait } from "../src/data/champions/portrait-policy";

export interface ImportPlayer { id: string; canonicalHandle: string }
export interface ImportPaths {
  root: string;
  players: ImportPlayer[];
  discover(player: ImportPlayer, stageDir: string): Promise<GeneratedPortrait | null>;
}
export interface GeneratedPortrait {
  playerId: string;
  portrait: string;
  sourceId: string;
  sha256: string;
  source: {
    id: string;
    url: string;
    originalUrl: string;
    retrievedAt: string;
    usage: "asset";
    credit: string;
    license: string;
  };
}
export interface ClientOptions {
  cacheDir: string;
  fetch: typeof globalThis.fetch;
  wait(ms: number): Promise<void>;
  userAgent: string;
  scheduler?: LiquipediaRequestScheduler;
  timeoutMs?: number;
  jsonMaxBytes?: number;
}

const API_DELAY_MS = 2_000;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const VALORANT_API = "https://liquipedia.net/valorant/api.php";
const COMMONS_API = "https://liquipedia.net/commons/api.php";

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

export class LiquipediaRequestScheduler {
  private requested = false;
  private queue: Promise<void> = Promise.resolve();

  schedule<T>(wait: (milliseconds: number) => Promise<void>, request: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      if (this.requested) await wait(API_DELAY_MS);
      this.requested = true;
      return request();
    }, async () => {
      if (this.requested) await wait(API_DELAY_MS);
      this.requested = true;
      return request();
    });
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
}

const globalRequestScheduler = new LiquipediaRequestScheduler();

const approvedMediaUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "liquipedia.net" && url.pathname.startsWith("/commons/images/");
  } catch { return false; }
};

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export class CachedLiquipediaClient {
  readonly fetch: typeof globalThis.fetch;
  private readonly cacheDir: string;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly scheduler: LiquipediaRequestScheduler;
  private readonly timeoutMs: number;
  private readonly jsonMaxBytes: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  readonly userAgent: string;

  constructor(options: ClientOptions) {
    this.cacheDir = options.cacheDir;
    this.fetch = options.fetch;
    this.wait = options.wait;
    this.userAgent = options.userAgent;
    this.scheduler = options.scheduler ?? globalRequestScheduler;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.jsonMaxBytes = options.jsonMaxBytes ?? MAX_JSON_BYTES;
  }

  cachePath(url: string): string {
    return join(this.cacheDir, `${sha256(url)}.json`);
  }

  request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Accept-Encoding", "gzip");
    headers.set("User-Agent", this.userAgent);
    return this.scheduler.schedule(this.wait, () => new Promise<Response>((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); reject(new Error("Liquipedia request timed out")); }, this.timeoutMs);
      this.fetch(url, { ...init, headers, signal: controller.signal }).then(
        response => { clearTimeout(timer); resolve(response); },
        error => { clearTimeout(timer); reject(error); },
      );
    }));
  }

  async media(url: string): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= 4; hop += 1) {
      if (!approvedMediaUrl(current)) throw new Error("unapproved Liquipedia media URL");
      const response = await this.request(current, { redirect: "manual" });
      if (response.status < 300 || response.status >= 400) {
        if (!response.ok) throw new Error(`Liquipedia ${response.status} for ${current}`);
        return response;
      }
      const location = response.headers.get("location");
      if (!location) throw new Error("Liquipedia media redirect missing location");
      current = new URL(location, current).href;
    }
    throw new Error("Liquipedia media redirect limit exceeded");
  }

  private async body(response: Response, limit: number, label: string): Promise<Buffer> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw new Error(`${label} exceeds ${limit} bytes`);
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const read = reader.read();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => { timeoutId = setTimeout(() => reject(new Error("Liquipedia request timed out")), this.timeoutMs); });
      let part: ReadableStreamReadResult<Uint8Array>;
      try { part = await Promise.race([read, timeout]); } catch (error) { await reader.cancel(); throw error; } finally { if (timeoutId) clearTimeout(timeoutId); }
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error(`${label} exceeds ${limit} bytes`); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  }

  bytes(response: Response, limit: number): Promise<Buffer> { return this.body(response, limit, "portrait download"); }

  async json(url: string): Promise<unknown> {
    const path = this.cachePath(url);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch {
        // A partial or manually-corrupted cache entry is replaced by a fresh response.
      }
    }

    const existing = this.inFlight.get(url);
    if (existing) return existing;
    const fetchJson = async () => {
      const response = await this.request(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Liquipedia ${response.status} for ${url}`);
      const payload = JSON.parse((await this.body(response, this.jsonMaxBytes, "JSON response")).toString("utf8"));
      mkdirSync(this.cacheDir, { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, JSON.stringify(payload));
      renameSync(temporary, path);
      return payload;
    };

    const pending = fetchJson().finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, pending);
    return pending;
  }
}

const expectedSourceId = (playerId: string) => {
  const match = /^player-(\d+)$/.exec(playerId);
  if (!match) throw new Error(`invalid portrait playerId ${playerId}`);
  return `liquipedia-portrait-${match[1]}`;
};

const sourceKeys = ["credit", "id", "license", "originalUrl", "retrievedAt", "url", "usage"];

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const validatePortraitSource = (source: unknown, sourceId: string, playerId: string) => {
  const keys = source && typeof source === "object" ? Reflect.ownKeys(source) : [];
  const stringKeys = keys.filter((key): key is string => typeof key === "string");
  if (keys.length !== stringKeys.length || stringKeys.sort().join("|") !== sourceKeys.join("|")) {
    throw new Error(`invalid portrait source keys for ${playerId}`);
  }
  const row = source as GeneratedPortrait["source"];
  if (typeof row.id !== "string" || typeof row.url !== "string" || typeof row.originalUrl !== "string" || typeof row.retrievedAt !== "string" || typeof row.usage !== "string" || typeof row.credit !== "string" || typeof row.license !== "string") {
    throw new Error(`invalid portrait source values for ${playerId}`);
  }
  if (row.id !== sourceId) throw new Error(`invalid portrait source id for ${playerId}`);
  if (!isHttps(row.url) || !isHttps(row.originalUrl)) throw new Error(`invalid portrait source URL for ${playerId}`);
  if (!validDate(row.retrievedAt)) throw new Error(`invalid portrait source retrieval date for ${playerId}`);
  if (row.usage !== "asset") throw new Error(`invalid portrait source usage for ${playerId}`);
  if (!row.credit.trim() || !row.license.trim()) throw new Error(`invalid portrait source credit or license for ${playerId}`);
  return {
    id: row.id,
    url: row.url,
    originalUrl: row.originalUrl,
    retrievedAt: row.retrievedAt,
    usage: row.usage,
    credit: row.credit,
    license: row.license,
  };
};

const validateGeneratedPortraits = (players: ImportPlayer[], results: GeneratedPortrait[], stageDir: string) => {
  const requested = new Map(players.map(player => [player.id, player]));
  if (requested.size !== players.length) throw new Error("duplicate requested playerId");
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(results.map(result => result.playerId))) throw new Error("duplicate portrait playerId");
  if (!unique(results.map(result => result.sourceId))) throw new Error("duplicate portrait sourceId");
  if (!unique(results.map(result => result.portrait))) throw new Error("duplicate portrait path");

  return results.map(result => {
    if (!requested.has(result.playerId)) throw new Error(`unrequested portrait playerId ${result.playerId}`);
    if (!/^[0-9a-f]{64}$/.test(result.sha256)) throw new Error(`invalid portrait sha256 for ${result.playerId}`);
    const filename = `${result.playerId}.${result.sha256.slice(0, 12)}.webp`;
    const portrait = `/assets/players/${filename}`;
    if (result.portrait !== portrait) throw new Error(`invalid portrait path for ${result.playerId}`);
    const sourceId = expectedSourceId(result.playerId);
    if (result.sourceId !== sourceId) throw new Error(`invalid portrait source id for ${result.playerId}`);
    const source = validatePortraitSource(result.source, sourceId, result.playerId);
    const stagedAsset = join(stageDir, filename);
    if (!existsSync(stagedAsset)) throw new Error(`staged portrait is missing for ${result.playerId}`);
    if (sha256(readFileSync(stagedAsset)) !== result.sha256) throw new Error(`staged portrait checksum mismatch for ${result.playerId}`);
    return { result, source, filename, stagedAsset };
  });
};

type Publication = { staged?: string; target: string; backup?: string; published: boolean };

const publishTransaction = (stageDir: string, publications: Publication[], createdPlayersDirectory: boolean, playersDirectory: string) => {
  const rollbackDirectory = join(stageDir, "rollback");
  mkdirSync(rollbackDirectory, { recursive: true });
  try {
    for (let index = 0; index < publications.length; index += 1) {
      const publication = publications[index];
      if (existsSync(publication.target)) {
        if (!lstatSync(publication.target).isFile()) throw new Error(`publication target is not a file: ${publication.target}`);
        publication.backup = join(rollbackDirectory, String(index));
        renameSync(publication.target, publication.backup);
      }
      if (publication.staged) renameSync(publication.staged, publication.target);
      publication.published = true;
    }
  } catch (error) {
    for (const publication of [...publications].reverse()) {
      if (publication.published && existsSync(publication.target)) rmSync(publication.target, { force: true });
      if (publication.backup && existsSync(publication.backup)) renameSync(publication.backup, publication.target);
    }
    if (createdPlayersDirectory && existsSync(playersDirectory)) rmSync(playersDirectory, { recursive: true, force: true });
    throw error;
  }
};

export async function buildPortraitOutputs({ root, players, discover }: ImportPaths): Promise<void> {
  const catalogDirectory = join(root, "src", "data", "champions");
  const assetsPath = join(catalogDirectory, "portrait-assets.json");
  const sourcesPath = join(catalogDirectory, "portrait-sources.json");
  const stageDir = mkdtempSync(join(root, ".portrait-import-"));

  try {
    const discoveries = await Promise.allSettled(players.map(player => discover(player, stageDir)));
    const failure = discoveries.find((discovery): discovery is PromiseRejectedResult => discovery.status === "rejected");
    if (failure) throw failure.reason;
    const discovered = discoveries
      .filter((discovery): discovery is PromiseFulfilledResult<GeneratedPortrait | null> => discovery.status === "fulfilled")
      .map(discovery => discovery.value);
    const results = discovered.filter((result): result is GeneratedPortrait => result !== null)
      .sort((left, right) => left.playerId.localeCompare(right.playerId));
    const stagedAssets = validateGeneratedPortraits(players, results, stageDir);

    const assetRows = results.map(({ playerId, portrait, sourceId, sha256: checksum }) => ({ playerId, portrait, sourceId, sha256: checksum }));
    const sourceRows = stagedAssets.map(({ source }) => source);

    const playersDirectory = join(root, "public", "assets", "players");
    mkdirSync(catalogDirectory, { recursive: true });
    const stagedAssetsCatalog = join(stageDir, "portrait-assets.json.tmp");
    const stagedSourcesCatalog = join(stageDir, "portrait-sources.json.tmp");
    writeFileSync(stagedAssetsCatalog, `${JSON.stringify(assetRows, null, 2)}\n`);
    writeFileSync(stagedSourcesCatalog, `${JSON.stringify(sourceRows, null, 2)}\n`);
    const createdPlayersDirectory = !existsSync(playersDirectory);
    mkdirSync(playersDirectory, { recursive: true });
    const published = new Set(stagedAssets.map(asset => asset.filename));
    const obsolete = readdirSync(playersDirectory).filter(filename => /^player-\d+\.[0-9a-f]{12}\.webp$/.test(filename) && !published.has(filename));
    publishTransaction(stageDir, [
      ...stagedAssets.map(({ filename, stagedAsset }) => ({ staged: stagedAsset, target: join(playersDirectory, filename), published: false })),
      { staged: stagedAssetsCatalog, target: assetsPath, published: false },
      { staged: stagedSourcesCatalog, target: sourcesPath, published: false },
      ...obsolete.map(filename => ({ target: join(playersDirectory, filename), published: false })),
    ], createdPlayersDirectory, playersDirectory);
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

type WikiPage = {
  title?: string;
  images?: Array<{ title?: string }>;
  revisions?: Array<{ slots?: { main?: { "*"?: string; content?: string } } }>;
  imageinfo?: Array<{ url?: string }>;
};
type WikiResponse = { query?: { pages?: Record<string, WikiPage> }; continue?: Record<string, string> };

const requestUrl = (endpoint: string, parameters: Record<string, string>) => {
  const query = new URLSearchParams(parameters);
  return `${endpoint}?${query.toString()}`;
};

async function queryAllImages(player: ImportPlayer, client: CachedLiquipediaClient): Promise<string[]> {
  const titles = new Set<string>();
  let continuation: Record<string, string> | undefined;
  do {
    const response = await client.json(requestUrl(VALORANT_API, {
      action: "query",
      format: "json",
      redirects: "1",
      prop: "images",
      imlimit: "max",
      titles: player.canonicalHandle,
      ...(continuation ?? {}),
    })) as WikiResponse;
    for (const page of Object.values(response.query?.pages ?? {})) {
      for (const image of page.images ?? []) if (image.title?.startsWith("File:")) titles.add(image.title);
    }
    continuation = response.continue;
  } while (continuation && Object.keys(continuation).length);
  return [...titles];
}

async function queryFilePages(titles: string[], client: CachedLiquipediaClient): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];
  for (let index = 0; index < titles.length; index += 50) {
    const response = await client.json(requestUrl(COMMONS_API, {
      action: "query",
      format: "json",
      prop: "revisions|imageinfo",
      rvprop: "content",
      rvslots: "main",
      iiprop: "url",
      titles: titles.slice(index, index + 50).join("|"),
    })) as WikiResponse;
    pages.push(...Object.values(response.query?.pages ?? {}));
  }
  return pages;
}

export type PortraitOutcomeKind = "accepted" | "missing" | "rights-rejected" | "ambiguous";
export interface PortraitOutcome { playerId: string; kind: PortraitOutcomeKind }

export function formatPortraitImportSummary(outcomes: PortraitOutcome[], total: number): string {
  if (outcomes.length !== total || new Set(outcomes.map(outcome => outcome.playerId)).size !== total) {
    throw new Error("portrait outcome total does not match input players");
  }
  const count = (kind: PortraitOutcomeKind) => outcomes.filter(outcome => outcome.kind === kind).length;
  return `portrait import summary: accepted=${count("accepted")} missing=${count("missing")} rights-rejected=${count("rights-rejected")} ambiguous=${count("ambiguous")} total=${total}`;
}

const report = (player: ImportPlayer, reason: Exclude<PortraitOutcomeKind, "accepted">, record?: (outcome: PortraitOutcome) => void) => {
  console.warn(`portrait ${reason}: ${player.id} (${player.canonicalHandle})`);
  record?.({ playerId: player.id, kind: reason });
};

export async function discoverLiquipediaPortrait(
  player: ImportPlayer,
  stageDir: string,
  client: CachedLiquipediaClient,
  record?: (outcome: PortraitOutcome) => void,
): Promise<GeneratedPortrait | null> {
  const fileTitles = await queryAllImages(player, client);
  if (!fileTitles.length) {
    report(player, "missing", record);
    return null;
  }

  const candidates = (await queryFilePages(fileTitles, client)).map(page => {
    const fileTitle = page.title ?? "";
    const wikitext = page.revisions?.[0]?.slots?.main?.["*"] ?? page.revisions?.[0]?.slots?.main?.content ?? "";
    return { assessment: assessPortrait(player.canonicalHandle, fileTitle, wikitext), originalUrl: page.imageinfo?.[0]?.url ?? "" };
  });
  const selected = choosePortrait(candidates.map(candidate => candidate.assessment));
  if (selected.kind === "ambiguous") {
    report(player, "ambiguous", record);
    return null;
  }
  if (selected.kind === "none") {
    report(player, candidates.some(candidate => candidate.assessment.reason === "rights-rejected") ? "rights-rejected" : "missing", record);
    return null;
  }

  const candidate = candidates.find(item => item.assessment.fileTitle === selected.candidate.fileTitle);
  const originalUrl = candidate?.originalUrl;
  if (!originalUrl || !approvedMediaUrl(originalUrl) || !isHttps(selected.candidate.source)) {
    throw new Error(`invalid HTTPS portrait URL for ${player.id}`);
  }
  const response = await client.media(originalUrl);
  const bytes = await client.bytes(response, MAX_DOWNLOAD_BYTES);
  const webp = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
    .rotate()
    .resize(256, 256, { fit: "cover", position: "attention", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
  const metadata = await sharp(webp, { failOn: "warning" }).metadata();
  if ((metadata.width ?? 0) < 96 || (metadata.height ?? 0) < 96) throw new Error(`portrait output is smaller than 96x96 for ${player.id}`);

  const checksum = sha256(webp);
  const filename = `${player.id}.${checksum.slice(0, 12)}.webp`;
  mkdirSync(stageDir, { recursive: true });
  writeFileSync(join(stageDir, filename), webp);
  const sourceId = expectedSourceId(player.id);
  const title = selected.candidate.fileTitle!;
  const descriptionUrl = `https://liquipedia.net/commons/${encodeURIComponent(title).replace(/%3A/gi, ":")}`;
  if (!isHttps(descriptionUrl)) throw new Error(`invalid Commons description URL for ${player.id}`);

  const generated: GeneratedPortrait = {
    playerId: player.id,
    portrait: `/assets/players/${filename}`,
    sourceId,
    sha256: checksum,
    source: {
      id: sourceId,
      url: descriptionUrl,
      originalUrl: selected.candidate.source,
      retrievedAt: new Date().toISOString().slice(0, 10),
      usage: "asset",
      credit: selected.candidate.credit,
      license: selected.candidate.license,
    },
  };
  record?.({ playerId: player.id, kind: "accepted" });
  return generated;
}

export interface ImportPortraitOptions {
  root: string;
  players: ImportPlayer[];
  userAgent: string;
  cacheDir?: string;
  fetch?: typeof globalThis.fetch;
  wait?: (milliseconds: number) => Promise<void>;
  scheduler?: LiquipediaRequestScheduler;
}

export async function importPortraits(options: ImportPortraitOptions): Promise<void> {
  const client = new CachedLiquipediaClient({
    cacheDir: options.cacheDir ?? join(options.root, ".cache", "liquipedia-portraits"),
    fetch: options.fetch ?? globalThis.fetch,
    wait: options.wait ?? sleep,
    userAgent: options.userAgent,
    scheduler: options.scheduler,
  });
  const outcomes: PortraitOutcome[] = [];
  await buildPortraitOutputs({
    root: options.root,
    players: options.players,
    discover: (player, stageDir) => discoverLiquipediaPortrait(player, stageDir, client, outcome => outcomes.push(outcome)),
  });
  console.log(formatPortraitImportSummary(outcomes, options.players.length));
}
