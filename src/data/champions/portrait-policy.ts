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
const FIELD = /^\|[ \t]*([a-z0-9_-]+)[ \t]*=[ \t]*(.*?)[ \t]*$/i;
const FILE_INFO_START = /\{\{\s*FileInfo\s*(?=\||\}\})/g;

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

const fileInfoTemplate = (wikitext: string) => {
  const starts = [...wikitext.matchAll(FILE_INFO_START)];
  if (starts.length !== 1 || starts[0].index === undefined) return null;

  const start = starts[0].index;
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

const depthOneParameters = (line: string, start: number) => {
  const parameters: string[] = [];
  let templateDepth = 0;
  let linkDepth = 0;

  for (let index = start; index < line.length; index += 1) {
    const token = line.slice(index, index + 2);
    if (token === "{{") {
      templateDepth += 1;
      index += 1;
    } else if (token === "}}") {
      if (templateDepth === 0) {
        parameters.push(line.slice(start, index));
        return parameters;
      }
      templateDepth -= 1;
      index += 1;
    } else if (token === "[[") {
      linkDepth += 1;
      index += 1;
    } else if (token === "]]" && linkDepth) {
      linkDepth -= 1;
      index += 1;
    } else if (line[index] === "|" && templateDepth === 0 && linkDepth === 0) {
      parameters.push(line.slice(start, index));
      start = index + 1;
    }
  }

  parameters.push(line.slice(start));
  return parameters;
};

const openingParameters = (line: string) => {
  const opening = line.match(/^\{\{\s*FileInfo\s*\|/);
  return opening ? depthOneParameters(line, opening[0].length) : [];
};

const fieldsAtFileInfoDepth = (template: string) => {
  const fields = new Map<string, string[]>();
  let depth = 0;

  for (const line of template.split(/\r?\n/)) {
    if (depth === 0) {
      for (const parameter of openingParameters(line)) {
        addField(fields, `|${parameter}`);
      }
    } else if (depth === 1 && line.startsWith("|")) {
      for (const parameter of depthOneParameters(line, 1)) {
        addField(fields, `|${parameter}`);
      }
    }

    for (let index = 0; index < line.length; index += 1) {
      const token = line.slice(index, index + 2);
      if (token === "{{") {
        depth += 1;
        index += 1;
      } else if (token === "}}") {
        depth -= 1;
        index += 1;
      }
    }
  }

  return fields;
};

export function parseFileInfo(wikitext: string): FileInfo {
  const visibleWikitext = wikitext
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<nowiki\b[^>]*>[\s\S]*?(?:<\/nowiki\s*>|$)/gi, "");
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
  const riotOwned =
    /^(?:©\s*)?riot games(?:,?\s*inc\.?)?(?:\s+all rights reserved\.?)?$/i.test(
      info.copyright,
    );
  const riotSource =
    /^https:\/\/(?:www\.)?(?:riotgames\.com|flickr\.com\/photos\/valorantesports)\//i.test(
      info.source,
    );
  const candidateBasis = OPEN.test(info.license)
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
