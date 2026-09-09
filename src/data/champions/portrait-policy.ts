import { normalizeHandle } from "@/features/game/handle";

export interface FileInfo {
  featured: string[];
  date: string | null;
  license: string;
  author: string;
  copyright: string;
  note: string;
  source: string;
  conflicts: string[];
  templateValid: boolean;
}

export type AcceptedBasis = "open-license" | "riot-fan-policy";
export type PortraitReason =
  | "accepted"
  | "identity-mismatch"
  | "rights-rejected"
  | "metadata-incomplete";

export type PortraitAssessment = FileInfo & {
  accepted: boolean;
  basis: AcceptedBasis | null;
  credit: string;
  reason: PortraitReason;
  fileTitle?: string;
};

const OPEN = /^(?:cc0|public-domain|cc-by-(?:nc-)?(?:sa-)?(?:[1-4](?:\.0)?)?)$/i;
const RIOT_GAMES_OWNERSHIP = /^(?:©\s*)?riot games(?:,?\s*inc\.?)?(?:\s+all rights reserved\.?)?$/i;

export const isApprovedOpenPortraitLicense = (license: string) => OPEN.test(license.trim());

export const isRiotGamesCopyrightOwner = (value: string) => RIOT_GAMES_OWNERSHIP.test(value.trim());

export const hasRiotGamesCopyrightCredit = (credit: string) => {
  const [attribution, owner, ...extra] = credit.trim().split(/\s+\/\s+/);
  return !extra.length && (owner ? Boolean(attribution) && isRiotGamesCopyrightOwner(owner) : isRiotGamesCopyrightOwner(attribution));
};

export const isApprovedRiotPortraitOriginalUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname === "riotgames.com" || parsed.hostname === "www.riotgames.com") return true;
    return (parsed.hostname === "flickr.com" || parsed.hostname === "www.flickr.com")
      && parsed.pathname.startsWith("/photos/valorantesports/");
  } catch {
    return false;
  }
};
const FIELD = /^\|[ \t]*([a-z0-9_-]+)[ \t]*=[ \t]*([\s\S]*?)[ \t]*$/i;
const FILE_INFO_START = /^\{\{\s*FileInfo\s*(?=\||\}\})/;
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "track",
  "wbr",
]);
const MEDIAWIKI_SELF_CLOSING_TAGS = new Set(["nowiki", "pre", "ref", "references"]);

const plain = (value: string) =>
  value
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) =>
      label ?? target,
    )
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();

const sourceUrl = (value: string) => {
  const source = value.trim();
  const url =
    source.match(/^\[(https?:\/\/[^\s\]]+)(?:\s+[^\]]*)?\]$/i)?.[1] ??
    source.match(/^\[\[(https?:\/\/[^\]|]+)(?:\|[^\]]*)?\]\]$/i)?.[1] ??
    source;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
};

const tagAt = (wikitext: string, start: number) => {
  let index = start + 1;
  const closing = wikitext[index] === "/";
  if (closing) index += 1;
  while (/\s/.test(wikitext[index] ?? "")) index += 1;

  if (!/[A-Za-z]/.test(wikitext[index] ?? "")) return null;

  const nameStart = index;
  while (/[\w:-]/.test(wikitext[index] ?? "")) index += 1;
  const name = wikitext.slice(nameStart, index).toLowerCase();
  let quote: string | null = null;

  while (index < wikitext.length) {
    const character = wikitext[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      const raw = wikitext.slice(start, index + 1);
      return {
        name,
        closing,
        selfClosing:
          !closing &&
          (VOID_TAGS.has(name) ||
            (MEDIAWIKI_SELF_CLOSING_TAGS.has(name) && /\/\s*>$/.test(raw))),
        end: index + 1,
      };
    }
    index += 1;
  }

  return { name, closing, selfClosing: false, end: wikitext.length };
};

const rootFileInfoStarts = (wikitext: string) => {
  const starts: number[] = [];
  const tags: string[] = [];

  for (let index = 0; index < wikitext.length; index += 1) {
    if (wikitext[index] === "<") {
      const tag = tagAt(wikitext, index);
      if (tag) {
        if (tag.closing) {
          if (tags.at(-1) === tag.name) tags.pop();
        } else if (!tag.selfClosing) {
          tags.push(tag.name);
        }
        index = tag.end - 1;
        continue;
      }
    }

    if (!tags.length && FILE_INFO_START.test(wikitext.slice(index))) {
      starts.push(index);
    }
  }

  return starts;
};

const fileInfoTemplate = (wikitext: string) => {
  const starts = rootFileInfoStarts(wikitext);
  if (starts.length !== 1) return null;

  const start = starts[0];
  let depth = 0;

  for (let index = start; index < wikitext.length; index += 1) {
    const token = wikitext.slice(index, index + 2);
    if (token === "{{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (token === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) return wikitext.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }

  return null;
};

const incompleteFileInfo = (): FileInfo => ({
  featured: [],
  date: null,
  license: "",
  author: "",
  copyright: "",
  note: "",
  source: "",
  conflicts: [],
  templateValid: false,
});

const addField = (fields: Map<string, string[]>, value: string) => {
  const match = value.match(FIELD);
  if (!match) return;

  const key = match[1].toLowerCase();
  fields.set(key, [...(fields.get(key) ?? []), match[2].trim()]);
};

const fieldsAtFileInfoDepth = (template: string) => {
  const fields = new Map<string, string[]>();
  const opening = template.match(/^\{\{\s*FileInfo\s*/);
  if (!opening) return fields;

  let depth = 1;
  let linkDepth = 0;
  let parameterStart: number | null = null;
  const addParameter = (end: number) => {
    if (parameterStart === null) return;
    addField(fields, `|${template.slice(parameterStart, end).trim()}`);
  };

  for (let index = opening[0].length; index < template.length; index += 1) {
    const token = template.slice(index, index + 2);
    if (token === "{{") {
      depth += 1;
      index += 1;
    } else if (token === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        addParameter(index - 1);
        break;
      }
    } else if (token === "[[") {
      linkDepth += 1;
      index += 1;
    } else if (token === "]]" && linkDepth) {
      linkDepth -= 1;
      index += 1;
    } else if (template[index] === "|" && depth === 1 && linkDepth === 0) {
      addParameter(index);
      parameterStart = index + 1;
    }
  }

  return fields;
};

export function parseFileInfo(wikitext: string): FileInfo {
  const visibleWikitext = wikitext.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const template = fileInfoTemplate(visibleWikitext);
  if (!template) return incompleteFileInfo();

  const fields = fieldsAtFileInfoDepth(template);

  const featured = [...fields.entries()]
    .filter(([key]) => /^featured\d*$/.test(key))
    .flatMap(([, values]) => values.map(plain))
    .filter(Boolean);
  const conflicts = [...fields.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([key]) => key);
  const field = (key: string) => fields.get(key)?.[0] ?? "";

  return {
    featured,
    date: /^\d{4}-\d{2}-\d{2}$/.test(field("date"))
      ? field("date")
      : null,
    license: plain(field("license")).toLowerCase(),
    author: plain(field("author")),
    copyright: plain(field("copyright")),
    note: plain(field("note")),
    source: sourceUrl(field("source")),
    conflicts,
    templateValid: true,
  };
}

export function assessPortrait(
  handle: string,
  fileTitle: string,
  wikitext: string,
): PortraitAssessment {
  const info = parseFileInfo(wikitext);
  const identity = normalizeHandle(handle);
  const featured = info.featured.some(
    (value) => {
      try {
        return normalizeHandle(value) === identity;
      } catch {
        return false;
      }
    },
  );
  const riotOwned = isRiotGamesCopyrightOwner(info.copyright);
  const riotSource = isApprovedRiotPortraitOriginalUrl(info.source);
  const candidateBasis = isApprovedOpenPortraitLicense(info.license)
    ? "open-license"
    : info.license === "permission" && riotOwned && riotSource
      ? "riot-fan-policy"
      : null;
  const basis = info.templateValid && !info.conflicts.length ? candidateBasis : null;
  const credit = [info.author, info.copyright].filter(Boolean).join(" / ");
  const accepted =
    featured &&
    basis !== null &&
    Boolean(info.source) &&
    Boolean(info.author) &&
    Boolean(info.copyright);

  return {
    ...info,
    accepted,
    basis,
    credit,
    fileTitle,
    reason: accepted
      ? "accepted"
      : !info.templateValid || info.conflicts.length
        ? "metadata-incomplete"
        : !featured
        ? "identity-mismatch"
        : !basis
          ? "rights-rejected"
          : "metadata-incomplete",
  };
}

export function choosePortrait(
  candidates: PortraitAssessment[],
):
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "selected"; candidate: PortraitAssessment } {
  const accepted = candidates
    .filter((item) => item.accepted && item.fileTitle)
    .sort(
      (a, b) =>
        (b.date ?? "").localeCompare(a.date ?? "") ||
        a.fileTitle!.localeCompare(b.fileTitle!),
    );

  if (!accepted.length) return { kind: "none" };

  const latest = accepted[0].date;
  const tied = accepted.filter((item) => item.date === latest);

  return tied.length === 1
    ? { kind: "selected", candidate: tied[0] }
    : { kind: "ambiguous", candidates: tied.map((item) => item.fileTitle!) };
}
