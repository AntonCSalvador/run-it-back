import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "../narration";
import { HighlightFeed } from "./highlight-feed";

const moments = (prefix = "Moment"): Highlight[] => [1, 2, 3].map(index => ({
  id: `${prefix}-${index}`, kind: "ace", actorCardId: "a", side: "user",
  text: `${prefix} ${index}`, emphasis: "normal", map: "Ascent", mapIndex: 0,
}));
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("HighlightFeed", () => {
  it("replaces playback controls with an honest completion message after timed playback", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} />);

    tick(1600);
    tick(1600);

    expect(done).toHaveBeenCalledTimes(1);
    for (const name of ["Pause highlights", "Resume highlights", "1x", "2x", "Skip to result"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText("Highlights complete. Result ready.")).toBeVisible();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replaces playback controls with completion after Skip", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));

    expect(done).toHaveBeenCalledTimes(1);
    for (const name of ["Pause highlights", "Resume highlights", "1x", "2x", "Skip to result"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText("Highlights complete. Result ready.")).toBeVisible();
  });

  it("starts instant and reduced-motion presentation complete without dead playback controls", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} instant />);

    expect(done).toHaveBeenCalledTimes(1);
    for (const name of ["Pause highlights", "Resume highlights", "1x", "2x", "Skip to result"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText("Highlights complete. Result ready.")).toBeVisible();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("labels clutch and decisive moments visibly without changing repository narration", () => {
    const base = moments("Repository narration")[0];
    const highlights: Highlight[] = [
      { ...base, id: "normal", text: "Repository narration normal" },
      { ...base, id: "kind-clutch", kind: "clutch", text: "Repository narration clutch kind" },
      { ...base, id: "emphasis-clutch", emphasis: "clutch", text: "Repository narration clutch emphasis" },
      { ...base, id: "decisive", kind: "clutch", emphasis: "decisive", text: "Repository narration decisive" },
    ];

    render(<HighlightFeed highlights={highlights} onComplete={vi.fn()} instant />);
    const rows = within(screen.getByRole("log", { name: "Simulated series moments" })).getAllByRole("article");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).queryByText(/Clutch|Decisive/)).not.toBeInTheDocument();
    expect(within(rows[1]).getByText("Clutch")).toBeVisible();
    expect(within(rows[2]).getByText("Clutch")).toBeVisible();
    expect(within(rows[3]).getByText("Decisive")).toBeVisible();
    expect(within(rows[3]).queryByText("Clutch")).not.toBeInTheDocument();
    highlights.forEach((item, index) => expect(within(rows[index]).getByText(item.text)).toHaveTextContent(item.text));
  });

  it("pauses and resumes the queue without consuming elapsed time", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} />);
    expect(screen.getByRole("button", { name: "Pause highlights" })).toBeVisible();
    expect(screen.getByRole("button", { name: "1x" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2x" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Skip to result" })).toBeVisible();

    tick(1200);
    fireEvent.click(screen.getByRole("button", { name: "Pause highlights" }));
    expect(screen.getByRole("button", { name: "Resume highlights" })).toBeVisible();
    tick(10000);
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Resume highlights" }));
    tick(1599);
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    tick(1);
    expect(screen.getByText("Moment 2")).toBeVisible();
  });

  it("appends timed moments to a stable labelled polite log", () => {
    render(<HighlightFeed highlights={moments()} onComplete={vi.fn()} />);
    const log = screen.getByRole("log", { name: "Simulated series moments" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("aria-relevant", "additions");
    expect(log).toHaveAttribute("aria-atomic", "false");
    const first = within(log).getByText("Moment 1");
    expect(log.children).toHaveLength(1);
    tick(1600);
    expect(screen.getByRole("log", { name: "Simulated series moments" })).toBe(log);
    expect(within(log).getByText("Moment 1")).toBe(first);
    const second = within(log).getByText("Moment 2");
    expect(log.children).toHaveLength(2);
    tick(1600);
    expect(within(log).getByText("Moment 1")).toBe(first);
    expect(within(log).getByText("Moment 2")).toBe(second);
    expect(Array.from(log.children, item => item.textContent)).toEqual(["Moment 1", "Moment 2", "Moment 3"]);
  });

  it("uses one live timer and completes a non-empty StrictMode queue once", () => {
    const done = vi.fn();
    const view = render(<StrictMode><HighlightFeed highlights={moments()} onComplete={done} /></StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    expect(screen.getAllByText("Moment 1")).toHaveLength(1);
    tick(1599);
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    tick(1);
    expect(screen.getAllByText("Moment 2")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    tick(1599);
    expect(done).not.toHaveBeenCalled();
    tick(1);
    expect(screen.getAllByText("Moment 3")).toHaveLength(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<StrictMode><HighlightFeed highlights={moments("Replacement")} onComplete={done} /></StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    tick(10000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it.each([["1x", 1600], ["2x", 800]] as const)("shows the first moment immediately and each next moment after exactly %s's interval", (speed, interval) => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} />);
    expect(screen.getByRole("heading", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
    expect(screen.getByText("Moment 1")).toBeVisible();
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: speed }));
    expect(screen.getByRole("button", { name: speed })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: speed === "1x" ? "2x" : "1x" })).toHaveAttribute("aria-pressed", "false");
    tick(interval - 1);
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    tick(1);
    expect(screen.getByText("Moment 2")).toBeVisible();
    expect(done).not.toHaveBeenCalled();
    tick(interval - 1);
    expect(screen.queryByText("Moment 3")).not.toBeInTheDocument();
    tick(1);
    expect(screen.getByText("Moment 3")).toBeVisible();
    expect(done).toHaveBeenCalledTimes(1);
    tick(10000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the old timer when switching speed and continues from the current moment", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} />);
    tick(1200);
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    expect(vi.getTimerCount()).toBe(1);
    tick(400); // The old 1x deadline must no longer reveal anything.
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    tick(399);
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    tick(1);
    expect(screen.getAllByText("Moment 2")).toHaveLength(1);
    tick(800);
    expect(screen.getAllByText("Moment 3")).toHaveLength(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("Skip reveals the whole queue immediately and completes once, cancelling the timer", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    for (const index of [1, 2, 3]) expect(screen.getByText(`Moment ${index}`)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Skip to result" })).not.toBeInTheDocument();
    tick(10000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("completes an empty queue exactly once (StrictMode %s)", strict => {
    const done = vi.fn();
    const feed = <HighlightFeed highlights={[]} onComplete={done} />;
    render(strict ? <StrictMode>{feed}</StrictMode> : feed);
    tick(10000);
    expect(screen.getByText("Highlights complete. Result ready.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Skip to result" })).not.toBeInTheDocument();
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets visibility, pending time and completion for a new highlight array", () => {
    const done = vi.fn();
    const first = moments();
    const view = render(<HighlightFeed highlights={first} onComplete={done} />);
    tick(1600);
    tick(1000);
    view.rerender(<HighlightFeed highlights={moments("New")} onComplete={done} />);
    expect(screen.queryByText("Moment 1")).not.toBeInTheDocument();
    expect(screen.getByText("New 1")).toBeVisible();
    expect(screen.queryByText("New 2")).not.toBeInTheDocument();
    tick(600); // Old queue's deadline.
    expect(screen.queryByText("New 2")).not.toBeInTheDocument();
    tick(999);
    expect(screen.queryByText("New 2")).not.toBeInTheDocument();
    tick(1);
    expect(screen.getByText("New 2")).toBeVisible();
    tick(1600);
    expect(done).toHaveBeenCalledTimes(1);
    view.rerender(<HighlightFeed highlights={[...moments("New")]} onComplete={done} />);
    expect(screen.queryByText("New 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    expect(done).toHaveBeenCalledTimes(2);
  });

  it("resets when contents change on the same array", () => {
    const done = vi.fn();
    const highlights = moments();
    const view = render(<HighlightFeed highlights={highlights} onComplete={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    highlights[0] = { ...highlights[0], text: "Updated first moment" };
    view.rerender(<HighlightFeed highlights={highlights} onComplete={done} />);
    expect(screen.getByText("Updated first moment")).toBeVisible();
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip to result" }));
    expect(done).toHaveBeenCalledTimes(2);
  });

  it("uses the latest callback without resetting the queue", () => {
    const highlights = moments();
    const oldDone = vi.fn();
    const newDone = vi.fn();
    const view = render(<HighlightFeed highlights={highlights} onComplete={oldDone} />);
    tick(1600);
    view.rerender(<HighlightFeed highlights={highlights} onComplete={newDone} />);
    expect(screen.getByText("Moment 2")).toBeVisible();
    tick(1600);
    expect(oldDone).not.toHaveBeenCalled();
    expect(newDone).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh queue after an empty queue and cancels it when replaced by empty", () => {
    const done = vi.fn();
    const view = render(<HighlightFeed highlights={[]} onComplete={done} />);
    expect(done).toHaveBeenCalledTimes(1);
    view.rerender(<HighlightFeed highlights={moments()} onComplete={done} />);
    expect(screen.getByText("Moment 1")).toBeVisible();
    expect(screen.queryByText("Moment 2")).not.toBeInTheDocument();
    tick(1599);
    view.rerender(<HighlightFeed highlights={[]} onComplete={done} />);
    expect(done).toHaveBeenCalledTimes(2);
    tick(10000);
    expect(done).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("instant presentation reveals all moments and completes without scheduling a timer", () => {
    const done = vi.fn();
    render(<HighlightFeed highlights={moments()} onComplete={done} instant />);
    for (const index of [1, 2, 3]) expect(screen.getByText(`Moment ${index}`)).toBeVisible();
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole("button", { name: "Skip to result" })).not.toBeInTheDocument();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("does not replay a completed instant queue when reduced motion is turned off", () => {
    const done = vi.fn();
    const highlights = moments();
    const view = render(<HighlightFeed highlights={highlights} onComplete={done} instant />);
    expect(screen.getByText("Moment 3")).toBeVisible();
    expect(done).toHaveBeenCalledTimes(1);

    view.rerender(<HighlightFeed highlights={highlights} onComplete={done} instant={false} />);

    expect(screen.getByText("Moment 3")).toBeVisible();
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("cleans all pending work on unmount, including instant completion (instant %s)", instant => {
    const done = vi.fn();
    const view = render(<HighlightFeed highlights={moments()} onComplete={done} instant={instant} />);
    const completedBeforeUnmount = done.mock.calls.length;
    view.unmount();
    tick(10000);
    expect(done).toHaveBeenCalledTimes(completedBeforeUnmount);
    expect(vi.getTimerCount()).toBe(0);
  });
});
