import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";
import { LegalNotice } from "./layout";

describe("home page", () => {
  it("opens directly into Run It Back", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Free Play" })).toBeVisible();
  });

  it("renders Riot's required legal notice", () => {
    render(<LegalNotice />);

    expect(screen.getByText('Run It Back was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.')).toBeVisible();
  });
});
