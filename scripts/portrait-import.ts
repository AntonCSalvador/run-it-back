import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
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
}

const API_DELAY_MS = 2_000;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const VALORANT_API = "https://liquipedia.net/valorant/api.php";
const COMMONS_API = "https://liquipedia.net/commons/api.php";

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

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
  readonly userAgent: string;
  private requestedUncached = false;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(options: ClientOptions) {
    this.cacheDir = options.cacheDir;
    this.fetch = options.fetch;
    this.wait = options.wait;
    this.userAgent = options.userAgent;
  }

  cachePath(url: string): string {
    return join(this.cacheDir, `${sha256(url)}.json`);
  }

  async json(url: string): Promise<unknown> {
    const path = this.cachePath(url);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch {
        // A partial or manually-corrupted cache entry is replaced by a fresh response.
      }
    }

    const fetchJson = async () => {
      if (this.requestedUncached) await this.wait(API_DELAY_MS);
      this.requestedUncached = true;
      const response = await this.fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "User-Agent": this.userAgent,
        },
      });
      if (!response.ok) throw new Error(`Liquipedia ${response.status} for ${url}`);
      const payload = await response.json();
      mkdirSync(this.cacheDir, { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, JSON.stringify(payload));
      renameSync(temporary, path);
      return payload;
    };

    const next = this.requestQueue.then(fetchJson, fetchJson);
    this.requestQueue = next.then(() => undefined, () => undefined);
    return next;
  }
}

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
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (!unique(results.map(result => result.playerId))) throw new Error("duplicate portrait playerId");
    if (!unique(results.map(result => result.sourceId))) throw new Error("duplicate portrait sourceId");
    if (!unique(results.map(result => result.portrait))) throw new Error("duplicate portrait path");
    if (results.some(result => result.source.id !== result.sourceId)) throw new Error("portrait source ID mismatch");

    const assetRows = results.map(({ playerId, portrait, sourceId, sha256: checksum }) => ({ playerId, portrait, sourceId, sha256: checksum }));
    const sourceRows = results.map(result => result.source);

    const playersDirectory = join(root, "public", "assets", "players");
    mkdirSync(playersDirectory, { recursive: true });
    const stagedAssets = results.map(result => ({
      result,
      filename: basename(result.portrait),
      stagedAsset: join(stageDir, basename(result.portrait)),
    }));
    for (const { result, stagedAsset } of stagedAssets) {
      if (!existsSync(stagedAsset)) throw new Error(`staged portrait is missing for ${result.playerId}`);
    }
    for (const { filename, stagedAsset } of stagedAssets) {
      renameSync(stagedAsset, join(playersDirectory, filename));
    }

    mkdirSync(catalogDirectory, { recursive: true });
    writeFileSync(`${assetsPath}.tmp`, `${JSON.stringify(assetRows, null, 2)}\n`);
    writeFileSync(`${sourcesPath}.tmp`, `${JSON.stringify(sourceRows, null, 2)}\n`);
    renameSync(`${assetsPath}.tmp`, assetsPath);
    renameSync(`${sourcesPath}.tmp`, sourcesPath);
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

async function readLimited(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("portrait download exceeds 15 MiB");
  }
  if (!response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_DOWNLOAD_BYTES) throw new Error("portrait download exceeds 15 MiB");
    return body;
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error("portrait download exceeds 15 MiB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const report = (player: ImportPlayer, reason: "missing" | "rights-rejected" | "ambiguous") => {
  console.warn(`portrait ${reason}: ${player.id} (${player.canonicalHandle})`);
};

export async function discoverLiquipediaPortrait(
  player: ImportPlayer,
  stageDir: string,
  client: CachedLiquipediaClient,
): Promise<GeneratedPortrait | null> {
  const fileTitles = await queryAllImages(player, client);
  if (!fileTitles.length) {
    report(player, "missing");
    return null;
  }

  const candidates = (await queryFilePages(fileTitles, client)).map(page => {
    const fileTitle = page.title ?? "";
    const wikitext = page.revisions?.[0]?.slots?.main?.["*"] ?? page.revisions?.[0]?.slots?.main?.content ?? "";
    return { assessment: assessPortrait(player.canonicalHandle, fileTitle, wikitext), originalUrl: page.imageinfo?.[0]?.url ?? "" };
  });
  const selected = choosePortrait(candidates.map(candidate => candidate.assessment));
  if (selected.kind === "ambiguous") {
    report(player, "ambiguous");
    return null;
  }
  if (selected.kind === "none") {
    report(player, candidates.some(candidate => candidate.assessment.reason === "rights-rejected") ? "rights-rejected" : "missing");
    return null;
  }

  const candidate = candidates.find(item => item.assessment.fileTitle === selected.candidate.fileTitle);
  const originalUrl = candidate?.originalUrl;
  if (!originalUrl || !isHttps(originalUrl) || !isHttps(selected.candidate.source)) {
    throw new Error(`invalid HTTPS portrait URL for ${player.id}`);
  }
  const response = await client.fetch(originalUrl, { headers: { "User-Agent": client.userAgent } });
  if (!response.ok) throw new Error(`Liquipedia ${response.status} for ${originalUrl}`);
  const bytes = await readLimited(response);
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
  const sourceId = `liquipedia-portrait-${player.id.replace(/^player-/, "")}`;
  const title = selected.candidate.fileTitle!;
  const descriptionUrl = `https://liquipedia.net/commons/${encodeURIComponent(title).replace(/%3A/gi, ":")}`;
  if (!isHttps(descriptionUrl)) throw new Error(`invalid Commons description URL for ${player.id}`);

  return {
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
}

export interface ImportPortraitOptions {
  root: string;
  players: ImportPlayer[];
  userAgent: string;
  cacheDir?: string;
  fetch?: typeof globalThis.fetch;
  wait?: (milliseconds: number) => Promise<void>;
}

export async function importPortraits(options: ImportPortraitOptions): Promise<void> {
  const client = new CachedLiquipediaClient({
    cacheDir: options.cacheDir ?? join(options.root, ".cache", "liquipedia-portraits"),
    fetch: options.fetch ?? globalThis.fetch,
    wait: options.wait ?? sleep,
    userAgent: options.userAgent,
  });
  await buildPortraitOutputs({
    root: options.root,
    players: options.players,
    discover: (player, stageDir) => discoverLiquipediaPortrait(player, stageDir, client),
  });
}
