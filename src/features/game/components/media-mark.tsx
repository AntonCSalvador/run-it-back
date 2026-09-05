"use client";

import { useState } from "react";
import { normalizeHandle } from "../handle";
import { assetUrl } from "../asset-url";

function initials(value: string): string {
  try { const words = normalizeHandle(value).split(/\s+/); return (words.length === 1 ? words[0].slice(0, 2) : words.map(part => part[0]).join("").slice(0, 2)).toUpperCase(); }
  catch { return "?"; }
}

export function MediaMark({ src, alt, label }: { src: string | null; alt: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = assetUrl(src);
  const text = initials(label ?? alt);
  return <span className="media-mark">{safeSrc && !failed
    // Public game data points at local static assets; this native image enables a same-sized error fallback.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="media-mark__image" src={safeSrc} alt={alt} onError={() => setFailed(true)} />
    : <span className="media-mark__fallback" role="img" aria-label={alt}>{text}</span>}
  </span>;
}
