import { MediaMark } from "./media-mark";

export function PlayerPortrait({ portrait, handle, variant, testId }: { portrait: string | null; handle: string; variant: "choice" | "compact"; testId?: string }) {
  return <MediaMark src={portrait} alt="" label={handle} className={`player-portrait player-portrait--${variant}`} fit="cover" loading={variant === "choice" ? "eager" : "lazy"} testId={testId} />;
}
