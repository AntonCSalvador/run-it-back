import { normalizeHandle } from "@/features/game/handle";

export interface FileInfo {
  featured: string[];
  date: string | null;
  license: string;
  author: string;
  copyright: string;
  note: string;
  source: string;
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
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();

export function parseFileInfo(wikitext: string): FileInfo {
  const fields = new Map<string, string>();

  for (const match of wikitext.matchAll(FIELD)) {
    fields.set(match[1].toLowerCase(), match[2].trim());
  }

  const featured = [...fields.entries()]
    .filter(([key]) => /^featured\d*$/.test(key))
    .map(([, value]) => plain(value))
    .filter(Boolean);

  return {
    featured,
    date: /^\d{4}-\d{2}-\d{2}$/.test(fields.get("date") ?? "")
      ? fields.get("date")!
      : null,
    license: plain(fields.get("license") ?? "").toLowerCase(),
    author: plain(fields.get("author") ?? ""),
    copyright: plain(fields.get("copyright") ?? ""),
    note: plain(fields.get("note") ?? ""),
    source: fields.get("source")?.trim() ?? "",
  };
}

export function assessPortrait(
  handle: string,
  _fileTitle: string,
  wikitext: string,
): PortraitAssessment {
  const info = parseFileInfo(wikitext);
  const identity = normalizeHandle(handle).toLocaleLowerCase("en-US");
  const featured = info.featured.some(
    (value) => normalizeHandle(value).toLocaleLowerCase("en-US") === identity,
  );
  const riotOwned = /\briot games\b/i.test(info.copyright);
  const riotSource =
    /^https:\/\/(?:www\.)?(?:riotgames\.com|flickr\.com\/photos\/valorantesports)\//i.test(
      info.source,
    );
  const basis = OPEN.test(info.license)
    ? "open-license"
    : info.license === "permission" && riotOwned && riotSource
      ? "riot-fan-policy"
      : null;
  const credit = [info.author, info.copyright].filter(Boolean).join(" / ");
  const accepted = featured && basis !== null && Boolean(info.source) && Boolean(credit);

  return {
    ...info,
    accepted,
    basis,
    credit,
    reason: accepted
      ? "accepted"
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
