import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "../domain";
import { ResultsView } from "./results-view";
import { dataset, lineup, terminalState } from "./tournament-test-fixtures";

const shareText = "Run It Back — Daily 2026-09-05\nStage: group\nSeries: L 1-2\nRerolls: 1\nRun It Back";
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
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
function renderResult(champion = false) {
  const onRunAgain = vi.fn();
  const onModeChange = vi.fn();
  const state = terminalState(champion);
  const view = render(<ResultsView mode="daily" tournament={state.tournament} cards={dataset.cards} rerollsUsed={1}
    shareText={shareText} onRunAgain={onRunAgain} onModeChange={onModeChange} />);
  return { ...view, state, onRunAgain, onModeChange };
}
const clickShare = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });

describe("ResultsView", () => {
  it.each([false, true])("shows exact terminal result, scores, roster and rerolls (champion %s)", champion => {
    const { state, container } = renderResult(champion);
    expect(screen.getByRole("heading", { name: champion ? "Champion" : "Eliminated" })).toBeVisible();
    expect(screen.getByText(`Stage reached: ${champion ? "final" : "group"}`)).toBeVisible();
    const results = within(screen.getByRole("region", { name: "Results" }));
    const seriesRows = within(results.getAllByRole("list")[0]).getAllByRole("listitem").filter(row => row.querySelector("ul"));
    expect(seriesRows).toHaveLength(champion ? 4 : 1);
    state.tournament.completedSeries.forEach((result, index) => {
      expect(seriesRows[index].firstChild?.textContent).toBe(result.stage);
      expect(seriesRows[index]).toHaveTextContent(`${result.stage}: ${result.userWins}–${result.opponentWins}`);
      expect(within(seriesRows[index]).getAllByRole("listitem").map(row => row.textContent)).toEqual(
        result.maps.map(map => `${map.map} ${map.userScore}–${map.opponentScore}`));
    });
    const roster = screen.getByRole("region", { name: "Drafted roster" });
    expect(roster.children).toHaveLength(5);
    expect(Array.from(roster.children, row => row.textContent)).toEqual(ROLES.map((role, index) =>
      `${role}: ${dataset.cards[index].displayHandle} ${dataset.cards[index].year}${dataset.cards[index].id === lineup.iglCardId ? " · IGL" : ""}`));
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

  it("calls Run again and both mode callbacks with native controls", () => {
    const { onRunAgain, onModeChange } = renderResult();
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    expect(onRunAgain).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Free Play" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Free Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(onModeChange.mock.calls).toEqual([["free-play"], ["daily"]]);
  });
});
