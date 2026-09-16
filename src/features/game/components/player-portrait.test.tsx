import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerPortrait } from "./player-portrait";

describe("PlayerPortrait", () => {
  it.each([["choice", "player-portrait--choice"], ["compact", "player-portrait--compact"]] as const)("renders %s portrait as decorative cover media", (variant, className) => {
    render(<PlayerPortrait portrait="/assets/players/player-1.abcdef123456.webp" handle="BeYN" variant={variant} />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("src", "/assets/players/player-1.abcdef123456.webp");
    expect(image).toHaveAttribute("loading", variant === "choice" ? "eager" : "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveStyle({ objectFit: "cover" });
    expect(image.parentElement).toHaveClass("player-portrait", className);
  });

  it("keeps decorative initials fallback out of the accessibility tree", () => {
    render(<PlayerPortrait portrait="/assets/players/player-1.abcdef123456.webp" handle="BeYN" variant="compact" />);
    fireEvent.error(screen.getByRole("presentation"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("BE")).toHaveAttribute("aria-hidden", "true");
  });
});
