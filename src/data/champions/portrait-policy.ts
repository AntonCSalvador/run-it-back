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
}

export type AcceptedBasis = "open-license" | "riot-fan-policy";

export type PortraitAssessment = FileInfo & {
  accepted: boolean;
  basis: AcceptedBasis | null;
  credit: string;
  reason: string;
  fileTitle?: string;
};

const OPEN = /^(?:cc0|public-domain|cc-by-(?:nc-)?(?:sa-)?(?:[1-4](?:\.0)?)?)$/i;
const FIELD = /^\|[ \t]*([a-z0-9_-]+)[ \t]*=[ \t]*(.*?)[ \t]*$/gim;

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
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
};

export function parseFileInfo(wikitext: string): FileInfo {
  const fields = new Map<string, string[]>();

  for (const match of wikitext.matchAll(FIELD)) {
    const key = match[1].toLowerCase();
    fields.set(key, [...(fields.get(key) ?? []), match[2].trim()]);
  }

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
  const basis = info.conflicts.length ? null : candidateBasis;
  const credit = [info.author, info.copyright].filter(Boolean).join(" / ");
  const accepted = featured && basis !== null && Boolean(info.source) && Boolean(credit);

  return {
    ...info,
    accepted,
    basis,
    credit,
    fileTitle,
    reason: accepted
      ? "accepted"
      : info.conflicts.length
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
