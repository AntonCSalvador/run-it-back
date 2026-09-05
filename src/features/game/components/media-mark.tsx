"use client";

import { useState } from "react";
import { normalizeHandle } from "../handle";
import { assetUrl } from "../asset-url";

function initials(value: string): string {
  try { const words = normalizeHandle(value).split(/\s+/); return (words.length === 1 ? words[0].slice(0, 2) : words.map(part => part[0]).join("").slice(0, 2)).toUpperCase(); }
  catch { return "?"; }
}

export function MediaMark({ src, alt, label }: { src: string | null; alt: string; label?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safeSrc = assetUrl(src);
  const text = initials(label ?? alt);
  const dimensions = { display: "inline-flex", width: "48px", height: "48px", aspectRatio: "1 / 1" } as const;
  const fill = { display: "block", width: "100%", height: "100%", objectFit: "contain" } as const;
  return <span className="media-mark" style={dimensions}>{safeSrc && failedSrc !== safeSrc
    // Public game data points at local static assets; this native image enables a same-sized error fallback.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="media-mark__image" style={fill} src={safeSrc} alt={alt} onError={() => setFailedSrc(safeSrc)} />
    : <span className="media-mark__fallback" style={fill} role="img" aria-label={alt}>{text}</span>}
  </span>;
}
