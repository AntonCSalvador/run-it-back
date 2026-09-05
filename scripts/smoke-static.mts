import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "parse5";

type HtmlNode = {
  nodeName?: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
};

type SmokeOptions = { basePath?: string; projectRoot?: string };

const projectRoot = resolve(process.cwd());

function contained(base: string, target: string) {
  const child = relative(base, target);
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function normalizeBasePath(basePath = "") {
  if (basePath === "") return "";
  if (!basePath.startsWith("/") || basePath.includes("\\") || /[?#]/.test(basePath) || basePath.split("/").some(part => part === "." || part === "..")) {
    throw new Error(`invalid base path "${basePath}"`);
  }
  return basePath.replace(/\/+$/, "");
}

function localReference(raw: string) {
  const value = raw.trim();
  if (/^(?:https?:|data:|mailto:|tel:)/i.test(value) || value.startsWith("//")) return null;
  if (value === "" || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) return null;
  if (value.includes("\\") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\") || /[?#]/.test(value)) {
    throw new Error(`invalid local reference "${raw}"`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error(`invalid encoded local reference "${raw}"`);
  }
  if (decoded.includes("\\") || decoded.split("/").some(part => part === "." || part === "..")) {
    throw new Error(`invalid local reference "${raw}"`);
  }
  return decoded;
}

function outputPath(outputDirectory: string, reference: string, basePath: string) {
  let local = reference;
  if (local.startsWith("/")) {
    if (basePath && !local.startsWith(`${basePath}/`) && local !== basePath) {
      throw new Error(`local reference is outside base path "${reference}"`);
    }
    local = basePath ? local.slice(basePath.length) : local;
  }
  const target = resolve(outputDirectory, `.${local.startsWith("/") ? local : `/${local}`}`);
  if (!contained(outputDirectory, target)) throw new Error(`local reference escapes output directory "${reference}"`);
  return target;
}

function collectReferences(node: HtmlNode, references: string[]) {
  const attrs = node.attrs ?? [];
  const src = attrs.find(attribute => attribute.name === "src")?.value;
  const href = attrs.find(attribute => attribute.name === "href")?.value;
  const isStylesheet = node.tagName === "link" && attrs.some(attribute => attribute.name === "rel" && attribute.value.split(/\s+/).includes("stylesheet"));
  if (node.tagName === "script" && src) references.push(src);
  if (isStylesheet && href) references.push(href);
  for (const child of node.childNodes ?? []) collectReferences(child, references);
}

function datasetAssets(dataDirectory: string) {
  const assets: string[] = [];
  for (const file of readdirSync(dataDirectory)) {
    if (!/^20\d\d\.json$/.test(file)) continue;
    const parsed = JSON.parse(readFileSync(resolve(dataDirectory, file), "utf8")) as { teams?: Array<{ logo?: string | null }>; players?: Array<{ portrait?: string | null }> };
    for (const team of parsed.teams ?? []) if (team.logo) assets.push(team.logo);
    for (const player of parsed.players ?? []) if (player.portrait) assets.push(player.portrait);
  }
  return assets;
}

function assetPath(root: string, asset: string, label: string) {
  const local = localReference(asset);
  if (!local || !local.startsWith("/assets/")) throw new Error(`invalid dataset asset "${asset}"`);
  const target = resolve(root, `.${local}`);
  if (!contained(root, target)) throw new Error(`dataset asset escapes ${label} "${asset}"`);
  return target;
}

export function smokeStatic(outputDirectory: string, options: SmokeOptions = {}) {
  const output = resolve(outputDirectory);
  const indexHtml = resolve(output, "index.html");
  if (!existsSync(indexHtml)) throw new Error(`index.html missing: ${indexHtml}`);
  const basePath = normalizeBasePath(options.basePath);
  const references: string[] = [];
  collectReferences(parse(readFileSync(indexHtml, "utf8")) as unknown as HtmlNode, references);

  const missing: string[] = [];
  for (const reference of references) {
    const local = localReference(reference);
    if (local && !existsSync(outputPath(output, local, basePath))) missing.push(reference);
  }

  const root = resolve(options.projectRoot ?? projectRoot);
  const publicRoot = resolve(root, "public");
  const assets = datasetAssets(resolve(root, "src/data/champions"));
  for (const asset of assets) {
    const sourceAsset = assetPath(publicRoot, asset, "public");
    const exportedAsset = outputPath(output, `${basePath}${asset}`, basePath);
    if (!existsSync(sourceAsset)) missing.push(`public${asset}`);
    if (!existsSync(exportedAsset)) missing.push(`${basePath}${asset}`);
  }

  if (missing.length > 0) throw new Error(`missing static files:\n${missing.map(path => `- ${path}`).join("\n")}`);
  return { references: references.length, assets: assets.length };
}

function parseArguments(args: string[]) {
  let outputDirectory = "out";
  let basePath = "";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--base-path") {
      basePath = args[++index] ?? "";
    } else if (argument.startsWith("--base-path=")) {
      basePath = argument.slice("--base-path=".length);
    } else if (!argument.startsWith("-") && outputDirectory === "out") {
      outputDirectory = argument;
    } else {
      throw new Error(`usage: smoke-static [output-directory] [--base-path /repository]`);
    }
  }
  return { outputDirectory, basePath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { outputDirectory, basePath } = parseArguments(process.argv.slice(2));
    const result = smokeStatic(outputDirectory, { basePath });
    console.log(`Static smoke passed: ${basename(resolve(outputDirectory))} (${result.references} references, ${result.assets} dataset assets)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
