import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES } from "../domain";
import { parseDataset } from "../schema";
import { assetUrl } from "../asset-url";
import { GameApp } from "./game-app";
import { MediaMark } from "./media-mark";
import { TeamOffer } from "./team-offer";

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
    expect(screen.getByText("Pick 1 of 5")).toBeVisible();
    expect(offered()).toHaveLength(3);
    expect(new Set(offered().map(button => button.textContent)).size).toBe(3);
    expect(new Set(offered().map(button => button.dataset.teamId)).size).toBe(3);
    const before = offered().map(button => button.textContent).join("|");
    const selectedTeam = offered().find(button => button.dataset.teamId === "team-2-2021")!;
    const selectedTeamId = selectedTeam.dataset.teamId!;
    await user.click(selectedTeam);
    expect(screen.getByText("Pick 1 of 5")).toBeVisible();
    const selectedCard = flexibleDataset.cards.find(card => card.teamId === selectedTeamId)!;
    expect(within(screen.getByTestId(`player-card-${selectedCard.id}`)).getByRole("presentation")).toHaveAttribute("src", "/assets/players/test.webp");
    expect(document.querySelectorAll(".role-chip").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Back to teams" }));
    expect(offered().map(button => button.textContent).join("|")).toBe(before);
    expect(screen.getByText("3 rerolls remaining")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Reroll teams/ }));
    expect(screen.getByText("2 rerolls remaining")).toBeVisible();
    expect(offered().map(button => button.textContent).join("|")).not.toBe(before);

    const drafted = new Set<string>();
    for (const role of ROLES) {
      const team = offered().find(button => Boolean(button.dataset.teamId))!;
      const teamId = team.dataset.teamId!;
      const card = flexibleDataset.cards.find(candidate => candidate.teamId === teamId && !drafted.has(candidate.id) && candidate.eligibleRoles.includes(role))!;
      await user.click(team);
      expect(screen.getByText(`Pick ${drafted.size + 1} of 5`)).toBeVisible();
      await user.click(screen.getByRole("button", { name: `${card.displayHandle} ${card.year}` }));
      expect(screen.getByText(`Pick ${drafted.size + 1} of 5`)).toBeVisible();
      await user.click(within(screen.getByRole("group", { name: "Choose an open role" })).getByRole("button", { name: role }));
      drafted.add(card.id);
      if (role === "smokes") expect(screen.queryByRole("button", { name: /Move .* to / })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Roster" })).toBeVisible();
    const sourceRole = "smokes";
    const targetRole = "duelist";
    const sourceCard = "player-21 2022";
    const displacedCard = "player-16 2022";
    expect(screen.getByLabelText(`${sourceRole} slot`)).toHaveTextContent(sourceCard);
    expect(screen.getByLabelText(`${targetRole} slot`)).toHaveTextContent(displacedCard);
    const move = screen.getByRole("button", { name: `Move ${sourceCard} to ${targetRole}` });
    await user.click(move);
    expect(screen.getByLabelText(`${targetRole} slot`)).toHaveTextContent(sourceCard);
    expect(screen.getByLabelText(`${sourceRole} slot`)).toHaveTextContent(displacedCard);
    expect(screen.getByRole("radiogroup", { name: "Choose in-game leader" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: cardLabelFromMove(move) }));
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Start tournament" }));
    expect(screen.getByText("Current phase: tournament")).toBeVisible();
    expect(screen.getByRole("button", { name: "Play series" })).toBeVisible();
    expect(screen.queryByText(/firepower|utility|survival|clutch|consistency|leadership|probability/i)).not.toBeInTheDocument();
  });

  it("keeps image fallback accessible and sized after an image error", async () => {
    render(<MediaMark src="/assets/teams/loud.webp" alt="LOUD 2022 logo" label="LOUD" />);
    const image = screen.getByRole("img", { name: "LOUD 2022 logo" });
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

  it("retries a new media URL after a previous URL fails", () => {
    const view = render(<MediaMark src="/assets/players/old.webp" alt="player portrait" label="player" />);
    fireEvent.error(screen.getByRole("img", { name: "player portrait" }));
    expect(screen.getByRole("img", { name: "player portrait" })).toHaveTextContent("PL");
    view.rerender(<MediaMark src="/assets/players/new.webp" alt="player portrait" label="player" />);
    expect(screen.getByRole("img", { name: "player portrait" })).toHaveAttribute("src", "/assets/players/new.webp");
    expect(screen.getByRole("img", { name: "player portrait" })).toHaveStyle({ objectFit: "contain" });
  });

  it("keeps decorative fallback media out of choice accessibility", () => {
    const choose = vi.fn();
    const onReroll = vi.fn();
    render(<TeamOffer teams={dataset.teams.slice(0, 3)} rerolls={3} canReroll={false} onChoose={choose} onReroll={onReroll} />);
    const choice = screen.getByRole("button", { name: `${dataset.teams[0].name} ${dataset.teams[0].year}` });
    expect(within(choice).queryByRole("img")).not.toBeInTheDocument();
    const reroll = screen.getByRole("button", { name: "Reroll teams" });
    expect(screen.getByText("3 rerolls remaining")).toBeVisible();
    expect(reroll).toBeDisabled();
    fireEvent.click(reroll);
    expect(onReroll).not.toHaveBeenCalled();
    expect(screen.getByText("3 rerolls remaining")).toBeVisible();
  });
});

function cardLabelFromMove(move: HTMLElement): string { return move.textContent!.replace(/^Move\s+/, "").replace(/\s+to\s+\w+$/, ""); }

describe("assetUrl", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("prefixes safe local assets without accepting unsafe paths", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/run-it-back/");
    expect(assetUrl("/assets/teams/loud.webp")).toBe("/run-it-back/assets/teams/loud.webp");
    expect(assetUrl("/run-it-back/assets/teams/loud.webp")).toBe("/run-it-back/assets/teams/loud.webp");
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl("https://example.test/logo.webp")).toBeNull();
    expect(assetUrl("/assets/../secret.webp")).toBeNull();
  });
  it.each(["/assets/%2e%2e/secret", "/assets/%252e%252e/secret", "/assets/a%2fb", "/assets/a%5cb", "/assets/a?x", "/assets/a#x"])("rejects hostile asset %s", path => expect(assetUrl(path)).toBeNull());
  it.each(["https://host", "//host", "/base/../x", "/base%2fhost"])("rejects hostile base %s", base => { vi.stubEnv("NEXT_PUBLIC_BASE_PATH", base); expect(assetUrl("/assets/a.webp")).toBeNull(); });
  it("does not confuse /assets base with an already-prefixed asset", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/assets");
    expect(assetUrl("/assets/logo.webp")).toBe("/assets/assets/logo.webp");
    expect(assetUrl("/assets/assets/logo.webp")).toBe("/assets/assets/logo.webp");
  });
  it.each(["/assets/%00x", "/assets/a%3fx", "/assets/a%23x", "/assets/%253fx"])("rejects decoded hostile asset %s", path => expect(assetUrl(path)).toBeNull());
});
