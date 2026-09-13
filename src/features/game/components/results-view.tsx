"use client";

import { useEffect, useRef, useState } from "react";
import { ROLES, type PlayerCard } from "../domain";
import type { Highlight } from "../narration";
import type { Stage } from "../opponents";
import type { TerminalResultProjection } from "../result-projection";
import { useFireAccent } from "./use-fire-accent";
import type { GameMode } from "../machine";
import { STAGE_ORDER } from "../tournament";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { humanRole } from "./role-picker";

const stageLabels: Record<Stage, { readonly display: string; readonly sentence: string }> = {
  group: { display: "Group stage", sentence: "group stage" },
  quarterfinal: { display: "Quarterfinal", sentence: "quarterfinal" },
  semifinal: { display: "Semifinal", sentence: "semifinal" },
  final: { display: "Final", sentence: "final" },
} as const;

export type StagedHighlight = Highlight & { readonly stage: Stage };

function highlightKindLabel(kind: Highlight["kind"]): string {
  return kind.split("-").map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

const MOMENT_LEAD_LIMIT = 4;

function Moment({ highlight }: { highlight: StagedHighlight }) {
  return <li data-heat={highlight.emphasis !== "normal"}>
    <p>{stageLabels[highlight.stage].display} · {highlightKindLabel(highlight.kind)} · {highlight.map}</p>
    <p>{highlight.text}</p>
  </li>;
}

export interface ResultsViewProps {
  mode: GameMode;
  result: TerminalResultProjection;
  cards: readonly PlayerCard[];
  highlights: readonly StagedHighlight[];
  rerollsUsed: number;
  shareText: string;
  onRunAgain(): void;
  onModeChange(mode: GameMode): void;
  portraitForPlayer?: PortraitForPlayer;
}

export function ResultsView({ mode, result, cards, highlights, rerollsUsed, shareText, onRunAgain, onModeChange, portraitForPlayer = () => null }: ResultsViewProps) {
  const { fireClass, trigger } = useFireAccent();
  const [message, setMessage] = useState("");
  const [fallbackCount, setFallbackCount] = useState(0);
  const [sharing, setSharing] = useState(false);
  const activeShare = useRef<symbol | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);
  const byId = new Map(cards.map(card => [card.id, card]));
  const champion = result.status === "valid" && result.outcome === "champion";

  useEffect(() => () => { activeShare.current = null; }, []);
  useEffect(() => { if (champion) trigger(); }, [champion, trigger]);
  useEffect(() => { outcomeHeading.current?.focus(); }, []);

  useEffect(() => {
    if (fallbackCount) { field.current?.focus(); field.current?.select(); }
  }, [fallbackCount]);

  const share = async (): Promise<void> => {
    if (activeShare.current !== null) return;
    const invocation = Symbol("share");
    activeShare.current = invocation;
    const isActive = () => activeShare.current === invocation;
    setSharing(true);
    setMessage("Sharing…");
    try {
      try {
        if (typeof navigator.share === "function") {
          await navigator.share({ text: shareText });
          if (isActive()) setMessage("Share sheet opened.");
          return;
        }
      } catch (error) {
        if (!isActive()) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          setMessage("Sharing cancelled.");
          return;
        }
      }
      if (!isActive()) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
          if (isActive()) setMessage("Copied to clipboard.");
          return;
        }
      } catch { /* Selectable fallback below, if this view is still active. */ }
      if (isActive()) {
        setMessage("Select and copy your result.");
        setFallbackCount(count => count + 1);
      }
    } finally {
      if (isActive()) {
        activeShare.current = null;
        setSharing(false);
      }
    }
  };

  if (result.status === "invalid") return <section aria-label="Results" className="results-view results-view--unavailable">
    <div className="results-view__outcome">
      <h2 ref={outcomeHeading} tabIndex={-1}>Tournament recap unavailable</h2>
      <p>{result.reason === "no-series" ? "No completed series are available for this run." : "A completed tournament outcome is not available for this run."}</p>
      <button className="action-button" type="button" onClick={onRunAgain}>Start {mode === "daily" ? "Daily" : "Free Play"}</button>
    </div>
  </section>;

  const { tournament, stageReached: reachedStage } = result;
  const wins = tournament.completedSeries.filter(series => series.userWins > series.opponentWins).length;
  const losses = tournament.completedSeries.length - wins;
  const primaryLabel = mode === "daily" ? "Try Free Play" : "Run another Free Play";
  const runPrimary = (): void => mode === "daily" ? onModeChange("free-play") : onRunAgain();

  return <section aria-label="Results" className={`results-view results-view--${champion ? "champion" : "eliminated"} ${champion ? fireClass : ""}`}>
    <div className="results-view__outcome">
      <h2 ref={outcomeHeading} tabIndex={-1}>{champion ? "Tournament champion" : `Eliminated in the ${stageLabels[reachedStage].sentence}`}</h2>
      <p>Reached the {stageLabels[reachedStage].sentence} · Series record {wins}–{losses}</p>
      <button className="action-button" type="button" onClick={runPrimary}>{primaryLabel}</button>
    </div>
    <section aria-label="Tournament path" className="results-view__path">
      <h3>Tournament path</h3>
      <ol>{STAGE_ORDER.map(stage => {
        const series = tournament.completedSeries.find(result => result.stage === stage);
        const won = series ? series.userWins > series.opponentWins : false;
        return <li key={stage} data-result={series ? won ? "won" : "lost" : "not-reached"}>
          <strong>{stageLabels[stage].display}</strong>
          <span>{series ? `${won ? "Won" : "Lost"} ${series.userWins}–${series.opponentWins}` : "Not reached"}</span>
        </li>;
      })}</ol>
    </section>
    <section aria-label="Drafted lineup" className="results-view__lineup">
      <h3>Drafted lineup</h3>
      <ol>{ROLES.map(role => {
      const card = byId.get(tournament.userLineup.slots.find(slot => slot.role === role)?.cardId ?? "");
      const isIgl = card?.id === tournament.userLineup.iglCardId;
      return <li key={role}>
        <span className="results-view__role">{humanRole(role)}</span>
        {card && <PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} />}
        <strong>{card?.displayHandle ?? "Unavailable player"}</strong>
        <span className="results-view__year">{card?.year ?? "Year unavailable"}</span>
        {isIgl && <span className="results-view__igl">IGL</span>}
      </li>;
    })}</ol></section>
    <section aria-label="Key moments" className="results-view__moments">
      <h3>Key moments</h3>
      {highlights.length ? <>
        <ol>{highlights.slice(0, MOMENT_LEAD_LIMIT).map(highlight => <Moment key={highlight.id} highlight={highlight} />)}</ol>
        {highlights.length > MOMENT_LEAD_LIMIT && <details className="results-view__moments-more">
          <summary>{highlights.length - MOMENT_LEAD_LIMIT} additional simulated moments</summary>
          <ol start={MOMENT_LEAD_LIMIT + 1}>{highlights.slice(MOMENT_LEAD_LIMIT).map(highlight => <Moment key={highlight.id} highlight={highlight} />)}</ol>
        </details>}
      </> : <p>{champion ? "No narrated key moments were retained." : "No narrated moments before elimination."}</p>}
    </section>
    <details className="results-view__maps">
      <summary>Map-by-map scores</summary>
      <ol>{tournament.completedSeries.map(series => <li key={series.stage}>
        <strong>{stageLabels[series.stage].display} · {series.userWins}–{series.opponentWins}</strong>
        <ol>{series.maps.map(map => <li key={map.map}>{map.map} {map.userScore}–{map.opponentScore}</li>)}</ol>
      </li>)}</ol>
    </details>
    <p className="results-view__rerolls">Rerolls used: {rerollsUsed}</p>
    <div className="results-view__secondary-actions">
      <button type="button" disabled={sharing} onClick={share}>Share result</button>
      {mode === "daily"
        ? <button type="button" onClick={onRunAgain}>Replay today&apos;s Daily</button>
        : <button type="button" onClick={() => onModeChange("daily")}>Try Daily</button>}
    </div>
    {fallbackCount > 0 && <textarea ref={field} readOnly value={shareText} aria-label="Share result" />}
    <p role="status" aria-label="Share status" aria-live="polite">{message}</p>
  </section>;
}
