import { lstatSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import sharp from "sharp";

export const MAX_PORTRAIT_BYTES = 15 * 1024 * 1024;
export const MAX_PORTRAIT_PIXELS = 80_000_000;
const REQUEST_TIMEOUT_MS = 30_000;
const APPROVED_HOSTS = [
  "liquipedia.net",
  "riotgames.com",
  "valorantesports.com",
  "playvalorant.com",
  "riotcdn.net",
  "rgpub.io",
  "contentstack.io",
  "static.developer.riotgames.com",
];

export interface CropFocus { x: number; y: number }
export interface RemotePortraitOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export function isApprovedPortraitMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && APPROVED_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function input(bytes: Buffer) {
  return sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PORTRAIT_PIXELS });
}

export async function convertPortrait(bytes: Buffer, focus?: CropFocus): Promise<Buffer> {
  const metadata = await input(bytes).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height || width * height > MAX_PORTRAIT_PIXELS) throw new Error("portrait input exceeds pixel limit");

  const image = input(bytes).rotate();
  if (!focus) {
    return image.resize(256, 256, { fit: "cover", position: "attention" }).webp({ quality: 82, effort: 5 }).toBuffer();
  }
  const side = Math.min(width, height);
  const left = Math.max(0, Math.min(width - side, Math.round(focus.x * width - side / 2)));
  const top = Math.max(0, Math.min(height - side, Math.round(focus.y * height - side / 2)));
  return image.extract({ left, top, width: side, height: side }).resize(256, 256).webp({ quality: 82, effort: 5 }).toBuffer();
}

async function readResponse(response: Response, limit: number, timeoutMs: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error(`portrait download exceeds ${limit} bytes`);
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const part = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => { timeoutId = setTimeout(() => reject(new Error("portrait request timed out")), timeoutMs); }),
      ]);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw new Error(`portrait download exceeds ${limit} bytes`);
      chunks.push(part.value);
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
  return Buffer.concat(chunks);
}

export async function loadRemotePortrait(url: string, options: RemotePortraitOptions = {}): Promise<Buffer> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let current = url;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (!isApprovedPortraitMediaUrl(current)) throw new Error("unapproved portrait media URL");
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        fetcher(current, { redirect: "manual", signal: controller.signal }),
        new Promise<never>((_resolve, reject) => { timeoutId = setTimeout(() => { controller.abort(); reject(new Error("portrait request timed out")); }, timeoutMs); }),
      ]);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("portrait media redirect missing location");
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) throw new Error(`portrait media ${response.status}`);
      return readResponse(response, MAX_PORTRAIT_BYTES, timeoutMs);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
  throw new Error("portrait media redirect limit exceeded");
}

export function loadCapturePortrait(root: string, capturePath: string): Buffer {
  const sourceDirectory = resolve(root, "assets", "portrait-sources");
  if (capturePath.split(/[\\/]/).includes("..")) throw new Error("invalid portrait capture path");
  const target = resolve(root, capturePath);
  if (!target.startsWith(`${sourceDirectory}${sep}`) || relative(sourceDirectory, target).startsWith("..")) throw new Error("invalid portrait capture path");
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid portrait capture file");
  if (stat.size > MAX_PORTRAIT_BYTES) throw new Error(`portrait capture exceeds ${MAX_PORTRAIT_BYTES} bytes`);
  return readFileSync(target);
}
