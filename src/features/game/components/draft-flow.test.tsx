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
const flexibleDataset = parseDataset({
  ...minimalDataset,
  players: minimalDataset.players.map(player => ({ ...player, portrait: "/assets/players/test.webp" })),
  cards: minimalDataset.cards.map(card => ({ ...card, eligibleRoles: [...ROLES] })),
});

describe("draft flow", () => {
  it("drafts a complete roster through its accessible controls", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={flexibleDataset} now={() => new Date("2026-09-05T12:00:00Z")} />);
    await user.click(screen.getByRole("button", { name: "Daily" }));
    const offered = () => within(screen.getByRole("region", { name: "Choose a team" })).getAllByRole("button").filter(button => /202[12]/.test(button.textContent ?? ""));
    expect(offered()).toHaveLength(3);
    expect(new Set(offered().map(button => button.textContent)).size).toBe(3);
    expect(new Set(offered().map(button => button.dataset.teamId)).size).toBe(3);
    const before = offered().map(button => button.textContent).join("|");
    await user.click(offered()[0]);
    expect(screen.getAllByRole("img", { name: /portrait/ })[0]).toHaveAttribute("src", "/assets/players/test.webp");
    expect(document.querySelectorAll(".role-chip").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Back to teams" }));
    expect(offered().map(button => button.textContent).join("|")).toBe(before);
    expect(screen.getByText("3 rerolls remaining")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Reroll teams/ }));
    expect(screen.getByText("2 rerolls remaining")).toBeVisible();
    expect(offered().map(button => button.textContent).join("|")).not.toBe(before);

    for (let pick = 0; pick < 5; pick += 1) {
      await user.click(offered()[0]);
      await user.click(screen.getAllByRole("button", { name: /player/i })[0]);
      const roles = screen.getByRole("group", { name: "Choose an open role" });
      await user.click(within(roles).getAllByRole("button")[0]);
      if (pick === 0) expect(screen.queryByRole("button", { name: /Move .* to / })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Roster" })).toBeVisible();
    const assignmentsBefore = [...screen.getByRole("region", { name: "Roster" }).querySelectorAll("strong")].map(label => label.parentElement?.textContent).join("|");
    const move = screen.getAllByRole("button", { name: /Move .* to / })[0];
    await user.click(move);
    const assignmentsAfter = [...screen.getByRole("region", { name: "Roster" }).querySelectorAll("strong")].map(label => label.parentElement?.textContent).join("|");
    expect(assignmentsAfter).not.toBe(assignmentsBefore);
    expect(screen.getByRole("radiogroup", { name: "Choose in-game leader" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeDisabled();
    await user.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Start tournament" }));
    expect(screen.getByText("Current phase: tournament")).toBeVisible();
    expect(screen.getByRole("button", { name: "Play current series" })).toBeVisible();
    expect(screen.queryByText(/firepower|utility|survival|clutch|consistency|leadership|probability/i)).not.toBeInTheDocument();
  });

  it("keeps image fallback accessible and sized after an image error", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={{ ...dataset, teams: dataset.teams.map((team, index) => index ? team : { ...team, logo: "/assets/teams/loud.webp" }) }} />);
    await user.click(screen.getByRole("button", { name: "Daily" }));
    const image = screen.getByRole("img", { name: /LOUD 2022 logo/ });
    const wrapper = image.parentElement as HTMLElement;
    expect(wrapper.style.display).toBe("inline-flex");
    expect(wrapper.style.width).toBe("48px");
    expect(wrapper.style.height).toBe("48px");
    expect((image as HTMLImageElement).style.width).toBe("100%");
    expect((image as HTMLImageElement).style.height).toBe("100%");
    expect((image as HTMLImageElement).style.display).toBe("block");
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "LOUD 2022 logo" })).toHaveTextContent("LO");
    const fallback = screen.getByRole("img", { name: "LOUD 2022 logo" }) as HTMLElement;
    expect(fallback.parentElement).toBe(wrapper);
    expect(fallback.style.width).toBe("100%");
    expect(fallback.style.height).toBe("100%");
    expect(fallback.style.display).toBe("block");
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
