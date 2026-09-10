import { createHash } from "node:crypto";
import {
  existsSync,
  copyFileSync,
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
import { convertPortrait, MAX_PORTRAIT_BYTES } from "./portrait-media";
import type { SourceRef } from "../src/features/game/domain";
import { sourceRefSchema } from "../src/features/game/schema";
import { parsePortraitCatalog, validatePortraitCatalog } from "../src/data/champions/portrait-catalog";
import { parsePortraitOverrides, type PortraitOverride } from "../src/data/champions/portrait-overrides";
import { portraitSourceId, validatePortraitSourceMetadata } from "../src/data/champions/portrait-source";
import { CuratedPortraitConversionError, discoverCuratedPortrait } from "./curated-portrait-import";

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
  source: SourceRef;
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

class PortraitByteLimitError extends Error {}

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

  private async body(response: Response, limit: number, label: string, oversized = () => new Error(`${label} exceeds ${limit} bytes`)): Promise<Buffer> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw oversized();
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
      if (length > limit) { await reader.cancel(); throw oversized(); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  }

  bytes(response: Response, limit: number): Promise<Buffer> { return this.body(response, limit, "portrait download", () => new PortraitByteLimitError(`portrait download exceeds ${limit} bytes`)); }

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

const sourceKeys = Object.keys(sourceRefSchema.shape);

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const validatePortraitSource = (source: unknown, sourceId: string, playerId: string) => {
  const keys = source && typeof source === "object" ? Reflect.ownKeys(source) : [];
  const stringKeys = keys.filter((key): key is string => typeof key === "string");
  if (keys.length !== stringKeys.length || stringKeys.some(key => !sourceKeys.includes(key))) {
    throw new Error(`invalid portrait source keys for ${playerId}`);
  }
  const row = source as GeneratedPortrait["source"];
  if (!sourceRefSchema.safeParse(source).success) throw new Error(`invalid portrait source for ${playerId}`);
  try { validatePortraitSourceMetadata(row); } catch { throw new Error(`invalid portrait source provenance for ${playerId}`); }
  if (typeof row.id !== "string" || typeof row.url !== "string" || typeof row.originalUrl !== "string" || typeof row.retrievedAt !== "string" || typeof row.usage !== "string" || typeof row.credit !== "string" || typeof row.license !== "string") {
    throw new Error(`invalid portrait source values for ${playerId}`);
  }
  if (row.id !== sourceId) throw new Error(`invalid portrait source id for ${playerId}`);
  if (!isHttps(row.url) || !isHttps(row.originalUrl)) throw new Error(`invalid portrait source URL for ${playerId}`);
  if (!validDate(row.retrievedAt)) throw new Error(`invalid portrait source retrieval date for ${playerId}`);
  if (row.usage !== "asset") throw new Error(`invalid portrait source usage for ${playerId}`);
  if (!row.credit.trim() || !row.license.trim()) throw new Error(`invalid portrait source credit or license for ${playerId}`);
  return { ...row };
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
    const sourceId = portraitSourceId(result.playerId, result.source.sourceKind!);
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
    if (results.length !== players.length) throw new Error("incomplete portrait import");
    const stagedAssets = validateGeneratedPortraits(players, results, stageDir);

    const assetRows = results.map(({ playerId, portrait, sourceId, sha256: checksum }) => ({ playerId, portrait, sourceId, sha256: checksum }));
    const sourceRows = stagedAssets.map(({ source }) => source);
    validatePortraitCatalog(players.map(player => ({ ...player, portrait: null, sourceIds: [] })), assetRows, sourceRows);
    await Promise.all(stagedAssets.map(async ({ stagedAsset }) => {
      const metadata = await sharp(readFileSync(stagedAsset), { failOn: "warning" }).metadata();
      if (metadata.format !== "webp" || metadata.width !== 256 || metadata.height !== 256) throw new Error("invalid portrait image dimensions or format");
      await sharp(readFileSync(stagedAsset), { failOn: "warning" }).raw().toBuffer();
    }));

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
  imageinfo?: Array<{ url?: string; thumburl?: string }>;
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
      iiurlwidth: "512",
      titles: titles.slice(index, index + 50).join("|"),
    })) as WikiResponse;
    pages.push(...Object.values(response.query?.pages ?? {}));
  }
  return pages;
}

export type PortraitOutcomeKind = "preserved" | "imported" | "replaced" | "uncovered";
export type PortraitUncoveredReason = "missing" | "rights-rejected" | "ambiguous" | "unsupported-image";
export interface PortraitOutcome { playerId: string; kind: PortraitOutcomeKind; reason?: PortraitUncoveredReason }
export type PortraitConverter = (bytes: Buffer) => Promise<Buffer>;

export function formatPortraitImportSummary(outcomes: PortraitOutcome[], total: number): string {
  if (outcomes.length !== total || new Set(outcomes.map(outcome => outcome.playerId)).size !== total) {
    throw new Error("portrait outcome total does not match input players");
  }
  const count = (kind: PortraitOutcomeKind) => outcomes.filter(outcome => outcome.kind === kind).length;
  return `portrait import summary: preserved=${count("preserved")} imported=${count("imported")} replaced=${count("replaced")} uncovered=${count("uncovered")} total=${total}`;
}

const report = (player: ImportPlayer, reason: PortraitUncoveredReason, record?: (outcome: PortraitOutcome) => void) => {
  record?.({ playerId: player.id, kind: "uncovered", reason });
};

const unsupportedImage = (player: ImportPlayer, record: ((outcome: PortraitOutcome) => void) | undefined, error: unknown) => {
  console.warn(`portrait unsupported-image: ${player.id} (${error instanceof Error ? error.message : String(error)})`);
  record?.({ playerId: player.id, kind: "uncovered", reason: "unsupported-image" });
  return null;
};

export async function discoverLiquipediaPortrait(
  player: ImportPlayer,
  stageDir: string,
  client: CachedLiquipediaClient,
  retrievalDate: string,
  record?: (outcome: PortraitOutcome) => void,
  converter: PortraitConverter = convertPortrait,
): Promise<GeneratedPortrait | null> {
  parsePortraitImportArgs(["--retrieved-at", retrievalDate]);
  const fileTitles = await queryAllImages(player, client);
  if (!fileTitles.length) {
    report(player, "missing", record);
    return null;
  }

  const candidates = (await queryFilePages(fileTitles, client)).map(page => {
    const fileTitle = page.title ?? "";
    const wikitext = page.revisions?.[0]?.slots?.main?.["*"] ?? page.revisions?.[0]?.slots?.main?.content ?? "";
    return { assessment: assessPortrait(player.canonicalHandle, fileTitle, wikitext), downloadUrl: page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url ?? "" };
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
  const downloadUrl = candidate?.downloadUrl;
  if (!downloadUrl || !approvedMediaUrl(downloadUrl) || !isHttps(selected.candidate.source)) {
    throw new Error(`invalid HTTPS portrait URL for ${player.id}`);
  }
  const response = await client.media(downloadUrl);
  let bytes: Buffer;
  try { bytes = await client.bytes(response, MAX_PORTRAIT_BYTES); } catch (error) {
    if (error instanceof PortraitByteLimitError) return unsupportedImage(player, record, error);
    throw error;
  }
  let webp: Buffer;
  try {
    webp = await converter(bytes);
    const metadata = await sharp(webp, { failOn: "warning" }).metadata();
    if ((metadata.width ?? 0) < 96 || (metadata.height ?? 0) < 96) throw new Error(`portrait output is smaller than 96x96 for ${player.id}`);
  } catch (error) {
    return unsupportedImage(player, record, error);
  }

  const checksum = sha256(webp);
  const filename = `${player.id}.${checksum.slice(0, 12)}.webp`;
  mkdirSync(stageDir, { recursive: true });
  writeFileSync(join(stageDir, filename), webp);
  const sourceId = portraitSourceId(player.id, "liquipedia");
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
      retrievedAt: retrievalDate,
      usage: "asset",
      credit: selected.candidate.credit,
      license: selected.candidate.license,
      sourceKind: "liquipedia",
      reuseBasis: selected.candidate.basis!,
      copyrightOwner: selected.candidate.copyright,
    },
  };
  record?.({ playerId: player.id, kind: "imported" });
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
  converter?: PortraitConverter;
  retrievalDate: string;
  overrides?: PortraitOverride[];
}

export function parsePortraitImportArgs(args: string[], today = new Date().toISOString().slice(0, 10)): string {
  const usage = "usage: npm run import:portraits -- --retrieved-at YYYY-MM-DD";
  if (args.length !== 2 || args[0] !== "--retrieved-at" || !validDate(args[1]) || args[1] > today) throw new Error(usage);
  return args[1];
}

export async function resolvePortrait(options: {
  player: ImportPlayer; override?: PortraitOverride; existing?: GeneratedPortrait;
  root: string; stageDir: string; client: CachedLiquipediaClient; fetch: typeof globalThis.fetch;
  retrievalDate: string; converter?: PortraitConverter;
}): Promise<{ portrait: GeneratedPortrait | null; outcome: PortraitOutcome }> {
  const { player, override, existing, root, stageDir, client, fetch, retrievalDate } = options;
  if (override) {
    try {
      const portrait = await discoverCuratedPortrait(player, override, root, stageDir, fetch, retrievalDate);
      return { portrait, outcome: { playerId: player.id, kind: existing ? "replaced" : "imported" } };
    } catch (error) {
      if (!(error instanceof CuratedPortraitConversionError)) throw error;
      return { portrait: null, outcome: { playerId: player.id, kind: "uncovered", reason: "unsupported-image" } };
    }
  }
  if (existing) {
    copyFileSync(join(root, "public", existing.portrait), join(stageDir, existing.portrait.split("/").at(-1)!));
    return { portrait: existing, outcome: { playerId: player.id, kind: "preserved" } };
  }
  let outcome: PortraitOutcome = { playerId: player.id, kind: "uncovered", reason: "missing" };
  const portrait = await discoverLiquipediaPortrait(player, stageDir, client, retrievalDate, value => { outcome = value; }, options.converter);
  return { portrait, outcome };
}

async function readExistingPortraits(options: ImportPortraitOptions): Promise<Map<string, GeneratedPortrait>> {
  const catalog = join(options.root, "src/data/champions");
  const assetsPath = join(catalog, "portrait-assets.json");
  const sourcesPath = join(catalog, "portrait-sources.json");
  if (!existsSync(assetsPath) && !existsSync(sourcesPath)) return new Map();
  const assets = parsePortraitCatalog(JSON.parse(readFileSync(assetsPath, "utf8")));
  const sources: SourceRef[] = JSON.parse(readFileSync(sourcesPath, "utf8"));
  validatePortraitCatalog(options.players.map(player => ({ ...player, portrait: null, sourceIds: [] })), assets, sources);
  const results = assets.map(asset => ({ ...asset, source: sources.find(source => source.id === asset.sourceId)! }));
  validateGeneratedPortraits(options.players, results, join(options.root, "public/assets/players"));
  for (const result of results) {
    const file = join(options.root, "public", result.portrait);
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error(`invalid existing portrait file ${result.playerId}`);
    const image = sharp(readFileSync(file), { failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "webp" || metadata.width !== 256 || metadata.height !== 256) throw new Error(`invalid existing portrait image ${result.playerId}`);
    await image.raw().toBuffer();
  }
  return new Map(results.map(result => [result.playerId, result]));
}

export async function importPortraits(options: ImportPortraitOptions): Promise<{ outcomes: PortraitOutcome[]; uncovered: string[]; published: boolean }> {
  parsePortraitImportArgs(["--retrieved-at", options.retrievalDate]);
  if (new Set(options.players.map(player => player.id)).size !== options.players.length) throw new Error("duplicate requested playerId");
  const overrides = new Map(parsePortraitOverrides(options.overrides ?? [], options.players).map(row => [row.playerId, row]));
  const existing = await readExistingPortraits(options);
  const client = new CachedLiquipediaClient({
    cacheDir: options.cacheDir ?? join(options.root, ".cache", "liquipedia-portraits"),
    fetch: options.fetch ?? globalThis.fetch,
    wait: options.wait ?? sleep,
    userAgent: options.userAgent,
    scheduler: options.scheduler,
  });
  const stageDir = mkdtempSync(join(options.root, ".portrait-import-"));
  try {
    const results = [];
    for (const player of [...options.players].sort((a, b) => a.id.localeCompare(b.id))) {
      results.push(await resolvePortrait({ ...options, player, override: overrides.get(player.id), existing: existing.get(player.id), stageDir, client, fetch: options.fetch ?? globalThis.fetch }));
    }
    const outcomes = results.map(result => result.outcome);
    const published = outcomes.every(outcome => outcome.kind !== "uncovered");
    if (published) {
      const portraits = new Map(results.map(result => [result.portrait!.playerId, result.portrait!]));
      await buildPortraitOutputs({ root: options.root, players: options.players, discover: async (player, destination) => {
        const portrait = portraits.get(player.id)!;
        const filename = portrait.portrait.split("/").at(-1)!;
        copyFileSync(join(stageDir, filename), join(destination, filename));
        return portrait;
      } });
    }
    console.log(formatPortraitImportSummary(outcomes, options.players.length));
    for (const outcome of outcomes.filter(outcome => outcome.kind === "uncovered")) {
      const player = options.players.find(player => player.id === outcome.playerId)!;
      console.warn(`portrait uncovered: ${player.id} (${player.canonicalHandle}) reason=${outcome.reason} next=riot-vct`);
    }
    return { outcomes, uncovered: outcomes.filter(outcome => outcome.kind === "uncovered").map(outcome => outcome.playerId), published };
  } finally { rmSync(stageDir, { recursive: true, force: true }); }
}
