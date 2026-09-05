import { act, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameApp } from "./game-app";

function streakStorage(streak: number) {
  return { length: 1, key: vi.fn(), getItem: vi.fn(() => JSON.stringify({ version: 1, completions: [], streak })), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
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
      expect(container).toHaveTextContent("Streak: 0");
      await act(async () => { root = hydrateRoot(container, <HydrationProbe />, { onRecoverableError: recoverable }); });
      expect(firstHydration).toHaveBeenCalledWith(0, expect.stringContaining("Streak: 0"));
      expect(container).toHaveTextContent("Streak: 7");
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      if (root) await act(async () => root?.unmount());
      container.remove();
      errors.mockRestore();
    }
  });

  it("refreshes the displayed streak after a blocked storage adapter recovers", () => {
    const storage = streakStorage(4);
    let blocked = true;
    storage.getItem.mockImplementation(() => {
      if (blocked) throw new Error("Storage access denied");
      return JSON.stringify({ version: 1, completions: [], streak: 4 });
    });
    render(<GameApp storage={storage} />);
    expect(screen.getByLabelText("Daily streak")).toHaveTextContent("Streak: 0");
    blocked = false;
    act(() => window.dispatchEvent(new Event("storage")));
    expect(screen.getByLabelText("Daily streak")).toHaveTextContent("Streak: 4");
  });
});
