import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page", () => {
  it("opens directly into Run It Back", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
  });
});
