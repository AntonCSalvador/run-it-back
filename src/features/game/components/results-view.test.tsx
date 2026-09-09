import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "../domain";
import { ResultsView, type StagedHighlight } from "./results-view";
import type { Highlight } from "../narration";
import { projectTerminalResult } from "../result-projection";
import { activeState, dataset, lineup, series, terminalState } from "./tournament-test-fixtures";
import { advanceTournament } from "../tournament";

const shareText = "Run It Back — Daily 2026-09-05\nStage: group\nSeries: L 1-2\nRerolls: 1\nRun It Back";
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const stageLabel = (stage: "group" | "quarterfinal" | "semifinal" | "final") => ({
  group: "Group stage", quarterfinal: "Quarterfinal", semifinal: "Semifinal", final: "Final",
})[stage];
function browserApis(share?: ReturnType<typeof vi.fn>, writeText?: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined });
}
afterEach(() => {
  cleanup();
  for (const [key, descriptor] of [["share", originalShare], ["clipboard", originalClipboard]] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
  vi.restoreAllMocks();
});
function renderResult(champion = false, options: { mode?: "daily" | "free-play"; tournament?: ReturnType<typeof terminalState>["tournament"]; highlights?: readonly StagedHighlight[] } = {}) {
  const onRunAgain = vi.fn();
  const onModeChange = vi.fn();
  const state = terminalState(champion);
    const view = render(<ResultsView mode={options.mode ?? "daily"} result={projectTerminalResult(options.tournament ?? state.tournament)} cards={dataset.cards} highlights={options.highlights ?? []} rerollsUsed={1}
      shareText={shareText} portraitForPlayer={() => "/assets/players/player-1.abcdef123456.webp"} onRunAgain={onRunAgain} onModeChange={onModeChange} />);
    return { ...view, state: { ...state, tournament: options.tournament ?? state.tournament }, onRunAgain, onModeChange };
}
const clickShare = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share result" })); });
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("ResultsView", () => {
  it.each(["active", "empty eliminated"] as const)("uses recovery content for an unavailable %s recap", status => {
    const active = activeState("group").tournament;
    const tournament = status === "active" ? active : { ...active, status: "eliminated" as const };
    const { container, onRunAgain } = renderResult(false, { tournament });

    const heading = screen.getByRole("heading", { name: "Tournament recap unavailable" });
    expect(heading).toHaveFocus();
    expect(screen.getByText("No completed series are available for this run.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Daily" })).toBeVisible();
    expect(container).not.toHaveTextContent(/Tournament champion|Eliminated|0–0/);
    expect(screen.queryByRole("region", { name: "Tournament path" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share result" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start Daily" }));
    expect(onRunAgain).toHaveBeenCalledTimes(1);
  });

  it("does not claim zero completed series when a nonterminal series is awaiting progression", () => {
    const active = activeState("group").tournament;
    renderResult(false, { tournament: { ...active, completedSeries: [series("group")] } });

    expect(screen.getByRole("heading", { name: "Tournament recap unavailable" })).toHaveFocus();
    expect(screen.getByText("A completed tournament outcome is not available for this run.")).toBeVisible();
    expect(screen.queryByText("No completed series are available for this run.")).not.toBeInTheDocument();
  });

  it.each([
    ["group win threshold", () => {
      const active = activeState("group").tournament;
      const lost = series("group", false);
      return { ...active, status: "eliminated" as const, completedSeries: [{ ...lost, userWins: 0, opponentWins: 1, maps: lost.maps.slice(0, 1) }] };
    }],
    ["group best-of", () => {
      const active = activeState("group").tournament;
      return { ...active, status: "eliminated" as const, completedSeries: [{ ...series("group", false), bestOf: 5 as const }] };
    }],
    ["final win threshold", () => {
      const active = activeState("final").tournament;
      const won = series("final");
      return { ...active, status: "champion" as const, completedSeries: [...active.completedSeries, { ...won, userWins: 1, opponentWins: 0, maps: won.maps.slice(0, 1) }] };
    }],
    ["map winner and score", () => {
      const active = activeState("group").tournament;
      const lost = series("group", false);
      const maps = lost.maps.map((map, index) => index === 0 ? { ...map, userScore: 13, opponentScore: 7 } : map);
      return { ...active, status: "eliminated" as const, completedSeries: [{ ...lost, maps }] };
    }],
  ] as const)("recovers instead of presenting a structurally invalid %s terminal series", (_, tournament) => {
    const { container } = renderResult(false, { tournament: tournament() });

    expect(screen.getByRole("heading", { name: "Tournament recap unavailable" })).toHaveFocus();
    expect(container).not.toHaveTextContent(/Tournament champion|Eliminated/);
    expect(screen.queryByRole("region", { name: "Tournament path" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share result" })).not.toBeInTheDocument();
  });

  it("leads a Daily recap with Free Play and keeps deterministic Daily replay subordinate", () => {
    const { container, onRunAgain, onModeChange } = renderResult(true);
    const outcome = screen.getByRole("heading", { name: "Tournament champion" });
    const primary = screen.getByRole("button", { name: "Try Free Play" });
    const replay = screen.getByRole("button", { name: "Replay today's Daily" });
    const path = screen.getByRole("region", { name: "Tournament path" });

    expect(outcome).toHaveFocus();
    expect(screen.getByText("Reached the final · Series record 4–0")).toBeVisible();
    expect(container.querySelector(".results-view")).toHaveClass("results-view--champion");
    expect(container.querySelectorAll(".action-button")).toHaveLength(1);
    expect(outcome.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primary.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(path.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primary).not.toHaveAttribute("aria-pressed");
    expect(replay).not.toHaveAttribute("aria-pressed");
    fireEvent.click(primary);
    fireEvent.click(replay);
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith("free-play");
    expect(onRunAgain).toHaveBeenCalledOnce();
  });

  it("names the exact elimination stage without champion treatment and leads into Free Play replay", () => {
    const semifinal = activeState("semifinal");
    const tournament = advanceTournament({
      ...semifinal.tournament,
      completedSeries: [...semifinal.tournament.completedSeries, series("semifinal", false)],
    });
    const { container } = renderResult(false, { mode: "free-play", tournament });

    expect(screen.getByRole("heading", { name: "Eliminated in the semifinal" })).toHaveFocus();
    expect(screen.getByText("Reached the semifinal · Series record 2–1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Run another Free Play" })).toHaveClass("action-button");
    expect(screen.getByRole("button", { name: "Try Daily" })).not.toHaveAttribute("aria-pressed");
    expect(container.querySelector(".results-view")).toHaveClass("results-view--eliminated");
    expect(container.querySelector(".results-view")).not.toHaveClass("results-view--champion");
  });

  it("shows all five ordered lineup roles with one visible IGL marker", () => {
    renderResult(true);
    const lineupRegion = screen.getByRole("region", { name: "Drafted lineup" });
    const slots = within(lineupRegion).getAllByRole("listitem");

    expect(slots).toHaveLength(5);
    expect(slots.map(slot => slot.textContent)).toEqual(ROLES.map((role, index) =>
      `${role[0].toUpperCase()}${role.slice(1)}${dataset.cards[index].displayHandle}${dataset.cards[index].year}${index === 0 ? "IGL" : ""}`));
    expect(within(lineupRegion).getAllByText("IGL")).toHaveLength(1);
  });

  it("renders retained moment text verbatim with truthful stage and type metadata", () => {
    const text = "aspas wins the simulated late-round clutch over player-6.";
    const highlight = {
      id: "semifinal-clutch", kind: "clutch", actorCardId: lineup.iglCardId, side: "user",
      text, emphasis: "clutch", map: "Ascent", mapIndex: 0, stage: "semifinal",
    } as const;
    renderResult(false, { highlights: [highlight] });
    const moments = screen.getByRole("region", { name: "Key moments" });

    expect(within(moments).getByText(text)).toBeVisible();
    expect(within(moments).getByText("Semifinal · Clutch · Ascent")).toBeVisible();
  });

  it("requires explicit stages when identical map positions occur in different series", () => {
    const shared = {
      kind: "clutch", actorCardId: lineup.iglCardId, side: "user", emphasis: "clutch", map: "Ascent", mapIndex: 0,
    } as const;
    const bare = { ...shared, id: "bare", text: "Ambiguous moment." } satisfies Highlight;
    // @ts-expect-error Recap highlights must identify their tournament stage.
    bare satisfies StagedHighlight;
    const highlights: readonly StagedHighlight[] = [
      { ...shared, id: "group-clutch", stage: "group", text: "The retained group moment." },
      { ...shared, id: "final-clutch", stage: "final", text: "The retained final moment." },
    ];

    renderResult(true, { highlights });

    expect(screen.getByText("Group stage · Clutch · Ascent")).toBeVisible();
    expect(screen.getByText("Final · Clutch · Ascent")).toBeVisible();
  });

  it("keeps a concise key-moment lead while preserving every retained moment on demand", () => {
    const highlights: readonly StagedHighlight[] = Array.from({ length: 6 }, (_, index) => ({
      id: `moment-${index + 1}`,
      kind: "clutch" as const,
      actorCardId: lineup.iglCardId,
      side: "user" as const,
      text: `Retained simulated moment ${index + 1}.`,
      emphasis: "clutch" as const,
      map: "Ascent",
      mapIndex: index,
      stage: index < 3 ? "semifinal" as const : "final" as const,
    }));

    renderResult(true, { highlights });
    const moments = screen.getByRole("region", { name: "Key moments" });
    const lead = moments.querySelector(":scope > ol");
    const summary = within(moments).getByText("2 additional simulated moments");
    const overflow = summary.closest("details");

    expect(lead?.children).toHaveLength(4);
    expect(overflow).not.toHaveAttribute("open");
    expect(overflow?.querySelector("ol")).toHaveAttribute("start", "5");
    expect(within(overflow as HTMLElement).getByText("Retained simulated moment 6.")).toBeInTheDocument();
    fireEvent.click(summary);
    expect(overflow).toHaveAttribute("open");
    expect(within(overflow as HTMLElement).getByText("2 additional simulated moments")).toBeVisible();
    for (let index = 1; index <= highlights.length; index += 1) {
      expect(within(moments).getAllByText(`Retained simulated moment ${index}.`)).toHaveLength(1);
    }
  });

  it("uses an honest empty-moment recovery and keeps map scores collapsed after the route", () => {
    renderResult(false);
    const path = screen.getByRole("region", { name: "Tournament path" });
    expect(within(path).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("No narrated moments before elimination.")).toBeVisible();
    const mapDetails = screen.getByText("Map-by-map scores").closest("details");
    expect(mapDetails).not.toHaveAttribute("open");
    expect(path.compareDocumentPosition(mapDetails!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("locks Share synchronously through a pending native share and unlocks after one final status", async () => {
    const pending = deferred();
    const share = vi.fn(() => pending.promise);
    const writeText = vi.fn();
    browserApis(share, writeText);
    renderResult();
    const button = screen.getByRole("button", { name: "Share result" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(share).toHaveBeenCalledExactlyOnceWith({ text: shareText });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status", { name: "Share status" })).toHaveTextContent("Sharing…");
    fireEvent.click(button);
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(); });
    expect(button).toBeEnabled();
    expect(screen.getByRole("status", { name: "Share status" })).toHaveTextContent("Share sheet opened.");
    expect(writeText).not.toHaveBeenCalled();
    await clickShare();
    expect(share).toHaveBeenCalledTimes(2);
    expect(button).toBeEnabled();
  });

  it("keeps one lock across native rejection and a pending clipboard fallback", async () => {
    const native = deferred();
    const clipboard = deferred();
    const share = vi.fn(() => native.promise);
    const writeText = vi.fn(() => clipboard.promise);
    browserApis(share, writeText);
    renderResult();
    const button = screen.getByRole("button", { name: "Share result" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => { native.reject(new Error("Unavailable")); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(shareText);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await act(async () => { clipboard.resolve(); });
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
    expect(screen.getByRole("status", { name: "Share status" })).toHaveTextContent("Copied to clipboard.");
  });

  it.each(["native", "clipboard"])("discards a pending %s rejection after unmount", async phase => {
    const pending = deferred();
    const writeText = vi.fn(() => phase === "clipboard" ? pending.promise : Promise.resolve());
    browserApis(phase === "native" ? vi.fn(() => pending.promise) : undefined, writeText);
    const view = renderResult();
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    fireEvent.click(screen.getByRole("button", { name: "Share result" }));
    view.unmount();
    await act(async () => { pending.reject(new Error("Denied")); });
    expect(writeText).toHaveBeenCalledTimes(phase === "clipboard" ? 1 : 0);
    expect(view.container).toBeEmptyDOMElement();
    expect(focus).not.toHaveBeenCalled();
  });

  it.each([false, true])("shows exact terminal result, scores, roster and rerolls (champion %s)", champion => {
    const { state, container } = renderResult(champion);
    expect(screen.getByRole("heading", { name: champion ? "Tournament champion" : "Eliminated in the group stage" })).toBeVisible();
    expect(screen.getByText(`Reached the ${champion ? "final" : "group stage"} · Series record ${champion ? "4–0" : "0–1"}`)).toBeVisible();
    fireEvent.click(screen.getByText("Map-by-map scores"));
    const details = screen.getByText("Map-by-map scores").closest("details")!;
    const seriesRows = within(details).getAllByRole("list")[0].children;
    expect(seriesRows).toHaveLength(champion ? 4 : 1);
    state.tournament.completedSeries.forEach((result, index) => {
      const row = seriesRows[index] as HTMLElement;
      expect(row).toHaveTextContent(`${stageLabel(result.stage)} · ${result.userWins}–${result.opponentWins}`);
      expect(within(row).getAllByRole("listitem").map(mapRow => mapRow.textContent)).toEqual(
        result.maps.map(map => `${map.map} ${map.userScore}–${map.opponentScore}`));
    });
    const roster = screen.getByRole("region", { name: "Drafted lineup" });
    expect(within(roster).getAllByRole("listitem")).toHaveLength(5);
    expect(within(roster).getAllByTestId(/^portrait-/)).toHaveLength(5);
    expect(screen.getByText("Rerolls used: 1")).toBeVisible();
    expect(container).not.toHaveTextContent(/strength|probability|\broll\b|traits|firepower|formula|0\.6|0\.2/iu);
  });

  it("uses native share successfully and reports status without copying", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    browserApis(share, writeText);
    renderResult();
    expect(screen.queryByRole("textbox", { name: "Share result" })).not.toBeInTheDocument();
    await clickShare();
    expect(share).toHaveBeenCalledExactlyOnceWith({ text: shareText });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByText("Share sheet opened.")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("treats native AbortError as cancellation without fallback", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Dismissed", "AbortError"));
    const writeText = vi.fn();
    browserApis(share, writeText);
    renderResult();
    await clickShare();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByText("Sharing cancelled.")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each(["rejected", "absent"])("copies exact safe text when native share is %s", async availability => {
    const share = availability === "rejected" ? vi.fn().mockRejectedValue(new Error("Unavailable")) : undefined;
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserApis(share, writeText);
    renderResult();
    await clickShare();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(shareText);
    if (share) expect(share).toHaveBeenCalledExactlyOnceWith({ text: shareText });
    expect(screen.getByText("Copied to clipboard.")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each(["rejected", "absent"])("reveals, focuses and selects readonly exact text when clipboard is %s", async availability => {
    browserApis(undefined, availability === "rejected" ? vi.fn().mockRejectedValue(new Error("Denied")) : undefined);
    renderResult();
    await clickShare();
    const field = screen.getByRole("textbox", { name: "Share result" }) as HTMLTextAreaElement;
    expect(field).toBeVisible();
    expect(field).toHaveValue(shareText);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(shareText.length);
    expect(screen.getByText("Select and copy your result.")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps Free Play replay primary and offers Daily as a subordinate action", () => {
    const { onRunAgain, onModeChange } = renderResult(false, { mode: "free-play" });
    const replay = screen.getByRole("button", { name: "Run another Free Play" });
    const daily = screen.getByRole("button", { name: "Try Daily" });
    expect(replay).toHaveClass("action-button");
    expect(replay).not.toHaveAttribute("aria-pressed");
    expect(daily).not.toHaveAttribute("aria-pressed");
    fireEvent.click(replay);
    fireEvent.click(daily);
    expect(onRunAgain).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith("daily");
  });
});
