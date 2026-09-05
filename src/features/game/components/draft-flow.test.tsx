import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES } from "../domain";
import { parseDataset } from "../schema";
import { assetUrl } from "../asset-url";
import { GameApp } from "./game-app";
import { MediaMark } from "./media-mark";

const dataset = parseDataset(minimalDataset);
const flexibleDataset = parseDataset({ ...minimalDataset, cards: minimalDataset.cards.map(card => ({ ...card, eligibleRoles: [...ROLES] })) });

describe("draft flow", () => {
  it("drafts a complete roster through its accessible controls", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={flexibleDataset} now={() => new Date("2026-09-05T12:00:00Z")} />);
    await user.click(screen.getByRole("button", { name: "Daily" }));
    expect(screen.getAllByRole("button", { name: /202[12]/ })).toHaveLength(3);
    const before = screen.getAllByRole("button", { name: /202[12]/ }).map(button => button.textContent).join("|");
    await user.click(screen.getByRole("button", { name: /Reroll teams/ }));
    expect(screen.getByText("2 rerolls remaining")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /202[12]/ }).map(button => button.textContent).join("|")).not.toBe(before);

    for (let pick = 0; pick < 5; pick += 1) {
      await user.click(screen.getAllByRole("button", { name: /202[12]/ })[0]);
      await user.click(screen.getAllByRole("button", { name: /player/i })[0]);
      const roles = screen.getByRole("group", { name: "Choose an open role" });
      await user.click(within(roles).getAllByRole("button")[0]);
    }
    expect(screen.getByRole("region", { name: "Roster" })).toBeVisible();
    const move = screen.getAllByRole("button", { name: /Move .* to / })[0];
    await user.click(move);
    expect(screen.getByRole("radiogroup", { name: "Choose in-game leader" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeDisabled();
    await user.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeEnabled();
    expect(screen.queryByText(/firepower|utility|survival|clutch|consistency|leadership|probability/i)).not.toBeInTheDocument();
  });

  it("keeps image fallback accessible and sized after an image error", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={{ ...dataset, teams: dataset.teams.map((team, index) => index ? team : { ...team, logo: "/assets/teams/loud.webp" }) }} />);
    await user.click(screen.getByRole("button", { name: "Daily" }));
    const image = screen.getByRole("img", { name: /LOUD 2022 logo/ });
    const wrapper = image.parentElement;
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "LOUD 2022 logo" })).toHaveTextContent("LO");
    expect(screen.getByRole("img", { name: "LOUD 2022 logo" }).parentElement?.className).toBe(wrapper?.className);
  });

  it("keeps a portrait fallback accessible after its image fails", () => {
    render(<MediaMark src="/assets/players/aspas.webp" alt="aspas portrait" label="aspas" />);
    const portrait = screen.getByRole("img", { name: "aspas portrait" });
    fireEvent.error(portrait);
    expect(screen.getByRole("img", { name: "aspas portrait" })).toHaveTextContent("AS");
  });
});

describe("assetUrl", () => {
  it("prefixes safe local assets without accepting unsafe paths", () => {
    const prior = process.env.NEXT_PUBLIC_BASE_PATH;
    process.env.NEXT_PUBLIC_BASE_PATH = "/run-it-back";
    expect(assetUrl("/assets/teams/loud.webp")).toBe("/run-it-back/assets/teams/loud.webp");
    expect(assetUrl("/run-it-back/assets/teams/loud.webp")).toBe("/run-it-back/assets/teams/loud.webp");
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl("https://example.test/logo.webp")).toBeNull();
    expect(assetUrl("/assets/../secret.webp")).toBeNull();
    process.env.NEXT_PUBLIC_BASE_PATH = prior;
  });
});
