import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES, type Role } from "../domain";
import { parseDataset } from "../schema";
import { assetUrl } from "../asset-url";
import { GameApp } from "./game-app";
import { MediaMark } from "./media-mark";
import { TeamOffer, type TeamOfferProps } from "./team-offer";
import { PlayerPicker } from "./player-picker";
import { RosterBar } from "./roster-bar";

const dataset = parseDataset(minimalDataset);
const flexibleDataset = parseDataset({
  ...minimalDataset,
  players: minimalDataset.players.map(player => ({ ...player, portrait: "/assets/players/test.webp" })),
  cards: minimalDataset.cards.map(card => ({ ...card, eligibleRoles: [...ROLES] })),
});

describe("draft flow", () => {
  it("presents each team-year offer as a numbered scouting decision", () => {
    const view = render(<TeamOffer teams={dataset.teams.slice(0, 3)} rerolls={3} canReroll onChoose={vi.fn()} onReroll={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
    expect(screen.getByText("Open an event roster, then draft one eligible player.")).toBeVisible();
    const choices = Array.from(view.container.querySelectorAll<HTMLElement>("[data-team-id]"));
    expect(choices).toHaveLength(3);
    choices.forEach((choice, index) => {
      const team = dataset.teams[index];
      expect(choice).toHaveAttribute("data-team-id", team.id);
      expect(choice).toHaveTextContent(`${team.year}`);
      expect(choice).toHaveTextContent(team.name);
      expect(choice.textContent!.indexOf(`${team.year}`)).toBeLessThan(choice.textContent!.indexOf(team.name));
      expect(within(choice).getByText("Scout roster")).toBeVisible();
      expect(within(choice).getByText(`Team ${index + 1} of 3`)).toBeVisible();
    });
  });

  it("names an available reroll by its full consequence and remaining count", () => {
    render(<TeamOffer teams={dataset.teams.slice(0, 3)} rerolls={3} canReroll onChoose={vi.fn()} onReroll={vi.fn()} />);

    const reroll = screen.getByRole("button", { name: "Replace all 3 teams · 3 left" });
    expect(reroll).toBeEnabled();
    expect(reroll).toHaveClass("secondary-action");
    expect(reroll).not.toHaveClass("action-button");
    expect(screen.getByText("This replaces every team in the current offer.")).toBeVisible();
  });

  it("keeps the exhausted reroll reason visible and programmatically associated", () => {
    render(<TeamOffer teams={dataset.teams.slice(0, 3)} rerolls={0} canReroll={false} rerollReason="No rerolls left" onChoose={vi.fn()} onReroll={vi.fn()} />);

    const reroll = screen.getByRole("button", { name: "Replace all 3 teams · 0 left" });
    expect(reroll).toBeDisabled();
    expect(reroll).toHaveAccessibleDescription("No rerolls left");
    expect(screen.getByText("No rerolls left")).toBeVisible();
  });

  it("never leaves a disabled reroll without an accessible reason at runtime", () => {
    // @ts-expect-error A disabled reroll requires a reason at the typed component boundary.
    const untypedDisabledProps: TeamOfferProps = {
      teams: dataset.teams.slice(0, 3), rerolls: 1, canReroll: false,
      onChoose: vi.fn(), onReroll: vi.fn(),
    };
    // @ts-expect-error An enabled reroll cannot expose an unavailable-state reason.
    const invalidEnabledProps: TeamOfferProps = {
      teams: dataset.teams.slice(0, 3), rerolls: 1, canReroll: true, rerollReason: "Unavailable",
      onChoose: vi.fn(), onReroll: vi.fn(),
    };
    void invalidEnabledProps;
    render(<TeamOffer {...untypedDisabledProps} />);

    const reroll = screen.getByRole("button", { name: "Replace all 3 teams · 1 left" });
    expect(reroll).toBeDisabled();
    expect(reroll).toHaveAccessibleDescription("Reroll unavailable");
    expect(screen.getByText("Reroll unavailable")).toBeVisible();
  });

  it("explains when repository eligibility cannot produce a different team offer", async () => {
    const onlyThree = parseDataset({
      ...minimalDataset,
      teams: minimalDataset.teams.slice(0, 3),
      cards: minimalDataset.cards.filter(card => minimalDataset.teams.slice(0, 3).some(team => team.id === card.teamId)),
    });
    const user = userEvent.setup();
    render(<GameApp dataset={onlyThree} freeSeedFactory={() => "no-alternative"} />);
    await user.click(screen.getByRole("button", { name: "Start Free Play" }));

    const reroll = screen.getByRole("button", { name: "Replace all 3 teams · 3 left" });
    expect(reroll).toBeDisabled();
    expect(reroll).toHaveAccessibleDescription("No other eligible team offers are available");
    expect(screen.getByText("No other eligible team offers are available")).toBeVisible();
  });

  it("shows only each player's eligible roles that are still open", () => {
    const card = { ...dataset.cards[0], eligibleRoles: ["duelist", "sentinel", "flex"] as Role[] };
    render(<PlayerPicker team={dataset.teams[0]} cards={[card]} openRoles={["sentinel", "flex"]} onChoose={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText("Only players who can fill an open role are shown.")).toBeVisible();
    const choice = screen.getByTestId(`player-card-${card.id}`);
    const action = within(choice).getByRole("button", { name: `${card.displayHandle} ${card.year}` });
    expect(action).toHaveAccessibleDescription("Eligible open roles: Sentinel, Flex");
    const summary = choice.querySelector(".player-card__roles");
    expect(summary).toBeVisible();
    expect(summary).toHaveTextContent("Eligible open roles: Sentinel, Flex");
    expect(within(choice).queryByText("duelist")).not.toBeInTheDocument();
  });

  it("uses repository initials when draft media is missing and preserves a long handle", () => {
    const longHandle = "ExtraordinarilyLongPlayerHandle";
    const card = { ...dataset.cards[0], displayHandle: longHandle };
    const teamView = render(<TeamOffer teams={dataset.teams.slice(0, 3)} rerolls={3} canReroll onChoose={vi.fn()} onReroll={vi.fn()} />);
    const firstTeam = teamView.container.querySelector<HTMLElement>("[data-team-id]")!;
    expect(within(firstTeam).getByText("LO")).toHaveClass("media-mark__fallback");
    teamView.unmount();

    render(<PlayerPicker team={dataset.teams[0]} cards={[card]} openRoles={card.eligibleRoles} portraitForPlayer={() => null} onChoose={vi.fn()} onBack={vi.fn()} />);
    const choice = screen.getByTestId(`player-card-${card.id}`);
    expect(within(choice).getByText("EX")).toHaveClass("media-mark__fallback");
    expect(within(choice).getByText(longHandle)).toHaveClass("player-card__handle");
  });

  it("names roster progress from the five canonical roles and keeps every slot visible", () => {
    const view = render(<RosterBar slots={{}} onMove={vi.fn()} canMove={false} />);
    let roster = screen.getByRole("region", { name: "Roster · 0 of 5 filled" });
    expect(within(roster).getAllByRole("listitem")).toHaveLength(5);
    for (const role of ROLES) expect(within(roster).getByLabelText(`${role} slot`)).toHaveTextContent("Open");

    view.rerender(<RosterBar slots={{ smokes: dataset.cards[0] }} onMove={vi.fn()} canMove={false} />);
    roster = screen.getByRole("region", { name: "Roster · 1 of 5 filled" });
    expect(within(roster).getByLabelText("smokes slot")).toHaveTextContent(`${dataset.cards[0].displayHandle} ${dataset.cards[0].year}`);
    expect(within(roster).queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
  });

  it("keeps the five-role roster beside the active draft decision", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={dataset} freeSeedFactory={() => "draft-layout"} />);
    await user.click(screen.getByRole("button", { name: "Start Free Play" }));

    const decision = screen.getByRole("region", { name: "Choose a team to scout" });
    const roster = screen.getByRole("region", { name: "Roster · 0 of 5 filled" });
    const layout = decision.closest(".draft-layout");
    expect(layout).not.toBeNull();
    expect(layout).toBe(roster.closest(".draft-layout"));
    expect(roster.closest(".scroll-track")).toBeNull();
  });

  it("drafts a complete roster through its accessible controls", async () => {
    const user = userEvent.setup();
    render(<GameApp dataset={flexibleDataset} now={() => new Date("2026-09-05T12:00:00Z")} />);
    await user.click(screen.getByRole("button", { name: "Start today's Daily" }));
    const offered = () => within(screen.getByRole("region", { name: "Choose a team to scout" })).getAllByRole("button").filter(button => /202[12]/.test(button.textContent ?? ""));
    expect(screen.getByRole("status")).toHaveTextContent("Pick 1 of 5");
    expect(offered()).toHaveLength(3);
    expect(new Set(offered().map(button => button.textContent)).size).toBe(3);
    expect(new Set(offered().map(button => button.dataset.teamId)).size).toBe(3);
    const before = offered().map(button => button.textContent).join("|");
    const selectedTeam = offered().find(button => button.dataset.teamId === "team-2-2021")!;
    const selectedTeamId = selectedTeam.dataset.teamId!;
    await user.click(selectedTeam);
    expect(screen.getByRole("status")).toHaveTextContent("Pick 1 of 5");
    const selectedCard = flexibleDataset.cards.find(card => card.teamId === selectedTeamId)!;
    const playerCard = screen.getByTestId(`player-card-${selectedCard.id}`);
    expect(playerCard).toHaveClass("player-card");
    expect(within(playerCard).getByRole("presentation")).toHaveAttribute("src", "/assets/players/test.webp");
    expect(document.querySelectorAll(".role-chip").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Back to teams" }));
    expect(offered().map(button => button.textContent).join("|")).toBe(before);
    await user.click(screen.getByRole("button", { name: "Replace all 3 teams · 3 left" }));
    expect(screen.getByRole("button", { name: "Replace all 3 teams · 2 left" })).toBeVisible();
    expect(offered().map(button => button.textContent).join("|")).not.toBe(before);

    const drafted = new Set<string>();
    for (const role of ROLES) {
      const team = offered().find(button => Boolean(button.dataset.teamId))!;
      const teamId = team.dataset.teamId!;
      const card = flexibleDataset.cards.find(candidate => candidate.teamId === teamId && !drafted.has(candidate.id) && candidate.eligibleRoles.includes(role))!;
      await user.click(team);
      expect(screen.getByRole("status")).toHaveTextContent(`Pick ${drafted.size + 1} of 5`);
      await user.click(within(screen.getByTestId(`player-card-${card.id}`)).getByRole("button"));
      expect(screen.getByRole("status")).toHaveTextContent(`Pick ${drafted.size + 1} of 5`);
      await user.click(within(screen.getByRole("group", { name: "Choose an open role" })).getByRole("button", { name: role }));
      drafted.add(card.id);
      if (role === "smokes") expect(screen.queryByRole("button", { name: /Move .* to / })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Roster · 5 of 5 filled" })).toBeVisible();
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
    expect(screen.getByRole("navigation", { name: "Run progress" })).toHaveTextContent("Round 1 of 4 · Group stage");
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
    render(<TeamOffer teams={dataset.teams.slice(0, 3)} rerolls={3} canReroll={false} rerollReason="Reroll unavailable" onChoose={choose} onReroll={onReroll} />);
    const choice = document.querySelector<HTMLElement>(`[data-team-id="${dataset.teams[0].id}"]`)!;
    expect(within(choice).queryByRole("img")).not.toBeInTheDocument();
    const reroll = screen.getByRole("button", { name: "Replace all 3 teams · 3 left" });
    expect(reroll).toBeDisabled();
    fireEvent.click(reroll);
    expect(onReroll).not.toHaveBeenCalled();
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
