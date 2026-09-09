"use client";

import { useState } from "react";
import { normalizeHandle } from "../handle";
import { assetUrl } from "../asset-url";

export interface MediaMarkProps {
  src: string | null;
  alt: string;
  label?: string;
  className?: string;
  fit?: "contain" | "cover";
  loading?: "eager" | "lazy";
  testId?: string;
}

function initials(value: string): string {
  try { const words = normalizeHandle(value).split(/\s+/); return (words.length === 1 ? words[0].slice(0, 2) : words.map(part => part[0]).join("").slice(0, 2)).toUpperCase(); }
  catch { return "?"; }
}

export function MediaMark({ src, alt, label, className, fit = "contain", loading, testId }: MediaMarkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safeSrc = assetUrl(src);
  const text = initials(label ?? alt);
  const fill = { display: "block", width: "100%", height: "100%", objectFit: fit } as const;
  return <span className={`media-mark${className ? ` ${className}` : ""}`} data-testid={testId}>{safeSrc && failedSrc !== safeSrc
    // Public game data points at local static assets; this native image enables a same-sized error fallback.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="media-mark__image" style={fill} width={48} height={48} src={safeSrc} alt={alt} loading={loading} decoding="async" onError={() => setFailedSrc(safeSrc)} />
    : alt ? <span className="media-mark__fallback" style={fill} role="img" aria-label={alt}>{text}</span> : <span className="media-mark__fallback" style={fill} aria-hidden="true">{text}</span>}
  </span>;
}
