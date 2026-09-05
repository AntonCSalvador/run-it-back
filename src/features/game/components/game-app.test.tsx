import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./error-boundary";
import { GameApp } from "./game-app";

describe("GameApp", () => {
  it("renders an accessible wordmark and mode controls immediately", () => {
    render(<GameApp />);
    expect(screen.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Free Play" })).toBeVisible();
  });

  it("recovers a broken subtree without clearing browser storage", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("run-it-back:history:v1", "keep-me");
    const Broken = () => { throw new Error("boom"); };
    render(<ErrorBoundary onRestart={() => undefined}><Broken /></ErrorBoundary>);
    expect(screen.getByText(/something went wrong/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restart run" }));
    expect(window.localStorage.getItem("run-it-back:history:v1")).toBe("keep-me");
  });
});
