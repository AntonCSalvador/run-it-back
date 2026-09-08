import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameApp } from "./game-app";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "../schema";
import { createDraft } from "../draft";
import { ACTIVE_RECORD, STORAGE_KEYS, writeRecord } from "../storage";
import { serializeActiveRun } from "../active-run";
import { activeState, dataset as tournamentDataset, gatewayFixture, series } from "./tournament-test-fixtures";
import type { SeriesResult } from "../tournament";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function streakStorage(streak: number) {
  const values = new Map<string, string>([[STORAGE_KEYS.daily, JSON.stringify({ version: 1, completions: [], streak })]]);
  return { length: 1, key: vi.fn(), getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => values.set(key, value)), removeItem: vi.fn((key: string) => values.delete(key)), clear: vi.fn() };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); }, clear() { values.clear(); } };
}

function restorableTournamentState() {
  const state = activeState("quarterfinal");
  return { ...state, draft: { ...state.draft, rerollsRemaining: 3 } };
}

describe("GameApp storage hydration", () => {
  it("uses streak zero on the server and first hydration, then restores the browser streak without mismatch", async () => {
    const storage = streakStorage(7);
    const firstHydration = vi.fn();
    function HydrationProbe() {
      useLayoutEffect(() => { firstHydration(storage.getItem.mock.calls.length, container.textContent); }, []);
      return <GameApp storage={storage} />;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recoverable = vi.fn();
    let root: Root | undefined;
    try {
      container.innerHTML = renderToString(<HydrationProbe />);
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(container).toHaveTextContent("Restoring saved run");
      await act(async () => { root = hydrateRoot(container, <HydrationProbe />, { onRecoverableError: recoverable }); });
      expect(firstHydration).toHaveBeenCalledWith(0, expect.stringContaining("Restoring saved run"));
      expect(container).toHaveTextContent("Current streak: 7");
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      if (root) await act(async () => root?.unmount());
      container.remove();
      errors.mockRestore();
    }
  });

  it("restores a saved player decision after the stable shell and focuses its task heading", async () => {
    const dataset = parseDataset(minimalDataset);
    const draft = createDraft("restore-player", dataset);
    const state = { phase: "player", mode: "free-play", draft: { ...draft, selectedTeamId: draft.offeredTeamIds[0] } } as const;
    const storage = memoryStorage();
    writeRecord(storage, ACTIVE_RECORD, { run: { phase: state.phase, mode: state.mode, draft: state.draft } });

    render(<GameApp dataset={dataset} storage={storage} />);

    const heading = await screen.findByRole("heading", { name: new RegExp(dataset.teams.find(team => team.id === state.draft.selectedTeamId)!.name) });
    expect(heading).toHaveFocus();
    expect(screen.getByText("Saved run restored. Continue from this decision.")).toBeVisible();
  });

  it("keeps the restoration shell and active record stable while an async gateway is pending", async () => {
    const state = restorableTournamentState();
    const storage = memoryStorage();
    writeRecord(storage, ACTIVE_RECORD, { run: serializeActiveRun(state) });
    const raw = storage.getItem(STORAGE_KEYS.active);
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    const pending = deferred<SeriesResult>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);

    render(<StrictMode><GameApp dataset={tournamentDataset} storage={storage} gateway={gateway} /></StrictMode>);

    expect(screen.getByText("Restoring saved run…")).toBeVisible();
    expect(storage.getItem(STORAGE_KEYS.active)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    await act(async () => pending.resolve(series("group")));
    expect(await screen.findByText(/Quarterfinal .* Round 2 of 4/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toHaveFocus();
  });

  it("ignores an async restore resolution after unmount", async () => {
    const state = restorableTournamentState();
    const storage = memoryStorage();
    writeRecord(storage, ACTIVE_RECORD, { run: serializeActiveRun(state) });
    const raw = storage.getItem(STORAGE_KEYS.active);
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    const pending = deferred<SeriesResult>();
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => pending.promise);
    const view = render(<GameApp dataset={tournamentDataset} storage={storage} gateway={gateway} />);
    view.unmount();

    await act(async () => pending.resolve(series("group", false)));

    expect(storage.getItem(STORAGE_KEYS.active)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("keeps confirmed exit authoritative when the cancelled initial gateway resolves", async () => {
    const state = restorableTournamentState();
    const storage = memoryStorage();
    writeRecord(storage, ACTIVE_RECORD, { run: serializeActiveRun(state) });
    const pending = deferred<SeriesResult>();
    const staleGateway = gatewayFixture();
    staleGateway.playSeries.mockImplementation(() => pending.promise);
    const currentGateway = gatewayFixture();
    const view = render(<GameApp dataset={tournamentDataset} storage={storage} gateway={staleGateway} />);

    view.rerender(<GameApp dataset={tournamentDataset} storage={storage} gateway={currentGateway} />);
    expect(await screen.findByText(/Quarterfinal .* Round 2 of 4/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Exit run" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
    expect(await screen.findByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();

    await act(async () => pending.resolve(series("group", false)));

    expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
  });

  it("keeps confirmed exit authoritative when a later gateway could leave restoration pending", async () => {
    const state = restorableTournamentState();
    const storage = memoryStorage();
    writeRecord(storage, ACTIVE_RECORD, { run: serializeActiveRun(state) });
    const initialGateway = gatewayFixture();
    const pendingGateway = gatewayFixture();
    const pending = deferred<SeriesResult>();
    pendingGateway.playSeries.mockImplementation(() => pending.promise);
    const view = render(<GameApp dataset={tournamentDataset} storage={storage} gateway={initialGateway} />);
    expect(await screen.findByText(/Quarterfinal .* Round 2 of 4/)).toBeVisible();

    view.rerender(<GameApp dataset={tournamentDataset} storage={storage} gateway={pendingGateway} />);
    expect(pendingGateway.playSeries).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Exit run" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit run and lose progress" }));
    expect(await screen.findByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();

    await act(async () => pending.resolve(series("group")));

    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
  });

  it("does not read or restore the bootstrap checkpoint again when the gateway changes after hydration", async () => {
    const state = restorableTournamentState();
    const storage = memoryStorage();
    writeRecord(storage, ACTIVE_RECORD, { run: serializeActiveRun(state) });
    const getItem = vi.spyOn(storage, "getItem");
    const initialGateway = gatewayFixture();
    const replacementGateway = gatewayFixture();
    const view = render(<GameApp dataset={tournamentDataset} storage={storage} gateway={initialGateway} />);
    expect(await screen.findByText(/Quarterfinal .* Round 2 of 4/)).toBeVisible();
    const activeReads = getItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.active).length;

    view.rerender(<GameApp dataset={tournamentDataset} storage={storage} gateway={replacementGateway} />);
    await act(async () => undefined);

    expect(getItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.active)).toHaveLength(activeReads);
    expect(replacementGateway.playSeries).not.toHaveBeenCalled();
    expect(screen.getByText(/Quarterfinal .* Round 2 of 4/)).toBeVisible();
  });

  it.each(["rejects", "returns a mismatched result"] as const)("preserves completed records when an async restore %s", async behavior => {
    const state = restorableTournamentState();
    const storage = memoryStorage();
    const dailyRaw = JSON.stringify({ version: 1, completions: [], streak: 0 });
    const historyRaw = JSON.stringify({ version: 1, runs: [] });
    storage.setItem(STORAGE_KEYS.daily, dailyRaw);
    storage.setItem(STORAGE_KEYS.history, historyRaw);
    writeRecord(storage, ACTIVE_RECORD, { run: serializeActiveRun(state) });
    const gateway = gatewayFixture();
    gateway.playSeries.mockImplementation(() => behavior === "rejects"
      ? Promise.reject(new Error("simulation unavailable"))
      : Promise.resolve(series("group", false)));
    const removeItem = vi.spyOn(storage, "removeItem");

    render(<GameApp dataset={tournamentDataset} storage={storage} gateway={gateway} />);

    expect(await screen.findByText("The saved run could not be restored. Completed results are safe. Start a new run when ready.")).toBeVisible();
    expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.daily)).toBe(dailyRaw);
    expect(storage.getItem(STORAGE_KEYS.history)).toBe(historyRaw);
    expect(removeItem).toHaveBeenCalledWith(STORAGE_KEYS.active);
    expect(removeItem).not.toHaveBeenCalledWith(STORAGE_KEYS.daily);
    expect(removeItem).not.toHaveBeenCalledWith(STORAGE_KEYS.history);
  });

  it("does not erase an unread checkpoint when the active read transiently fails", () => {
    const dataset = parseDataset(minimalDataset);
    const draft = createDraft("preserved-checkpoint", dataset);
    const raw = JSON.stringify({ version: 1, run: { phase: "team", mode: "free-play", draft } });
    const values = new Map<string, string>([[STORAGE_KEYS.active, raw]]);
    const removeItem = vi.fn((key: string) => values.delete(key));
    const storage: Storage = {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] ?? null; },
      getItem(key) {
        if (key === STORAGE_KEYS.active) throw new Error("active read temporarily blocked");
        return values.get(key) ?? null;
      },
      setItem(key, value) { values.set(key, value); },
      removeItem,
      clear() { values.clear(); },
    };

    render(<GameApp dataset={dataset} storage={storage} />);

    expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
    expect(values.get(STORAGE_KEYS.active)).toBe(raw);
    expect(removeItem).not.toHaveBeenCalledWith(STORAGE_KEYS.active);
    expect(screen.getByRole("alert")).toHaveTextContent("Local progress cannot persist");
  });

  it("does not overwrite an unread checkpoint with an in-memory fallback", async () => {
    const dataset = parseDataset(minimalDataset);
    const values = new Map<string, string>();
    let blocked = false;
    const storage: Storage = {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] ?? null; },
      getItem(key) { if (blocked && key === STORAGE_KEYS.active) throw new Error("active read temporarily blocked"); return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
      clear() { values.clear(); },
    };
    const memoryDraft = createDraft("memory-checkpoint", dataset);
    writeRecord(storage, ACTIVE_RECORD, { run: { phase: "team", mode: "free-play", draft: memoryDraft } });
    const underlyingDraft = createDraft("underlying-checkpoint", dataset);
    const underlyingRaw = JSON.stringify({ version: 1, run: { phase: "team", mode: "free-play", draft: underlyingDraft } });
    values.set(STORAGE_KEYS.active, underlyingRaw);
    blocked = true;

    render(<GameApp dataset={dataset} storage={storage} />);

    expect(await screen.findByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
    expect(values.get(STORAGE_KEYS.active)).toBe(underlyingRaw);
    expect(screen.getByRole("alert")).toHaveTextContent("Local progress cannot persist");
  });

  it("does not delete an unread checkpoint when the in-memory fallback is stale", async () => {
    const fullDataset = parseDataset(minimalDataset);
    const memoryDraft = createDraft("stale-memory-checkpoint", fullDataset);
    const removedTeam = memoryDraft.offeredTeamIds[0];
    const currentDataset = parseDataset({
      ...minimalDataset,
      teams: minimalDataset.teams.filter(team => team.id !== removedTeam),
      cards: minimalDataset.cards.filter(card => card.teamId !== removedTeam),
    });
    const values = new Map<string, string>();
    let blocked = false;
    const storage: Storage = {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] ?? null; },
      getItem(key) { if (blocked && key === STORAGE_KEYS.active) throw new Error("active read temporarily blocked"); return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
      clear() { values.clear(); },
    };
    writeRecord(storage, ACTIVE_RECORD, { run: { phase: "team", mode: "free-play", draft: memoryDraft } });
    const underlyingDraft = createDraft("current-underlying-checkpoint", currentDataset);
    const underlyingRaw = JSON.stringify({ version: 1, run: { phase: "team", mode: "free-play", draft: underlyingDraft } });
    values.set(STORAGE_KEYS.active, underlyingRaw);
    blocked = true;

    render(<GameApp dataset={currentDataset} storage={storage} />);

    expect(await screen.findByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(values.get(STORAGE_KEYS.active)).toBe(underlyingRaw);
  });

  it("refreshes the displayed streak after a blocked storage adapter recovers", () => {
    const storage = streakStorage(4);
    let blocked = true;
    storage.getItem.mockImplementation(() => {
      if (blocked) throw new Error("Storage access denied");
      return JSON.stringify({ version: 1, completions: [], streak: 4 });
    });
    render(<GameApp storage={storage} />);
    expect(screen.getByLabelText("Daily streak")).toHaveTextContent("Current streak: 0");
    blocked = false;
    act(() => window.dispatchEvent(new Event("storage")));
    expect(screen.getByLabelText("Daily streak")).toHaveTextContent("Current streak: 4");
  });
});
