import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { localFont, fontOptions } = vi.hoisted(() => {
  const options: unknown[] = [];
  return {
    fontOptions: options,
    localFont: vi.fn((value: { variable: string }) => {
      options.push(value);
      return {
        className: value.variable === "--font-rib-ui" ? "rib-ui-class" : "rib-display-class",
        variable: value.variable === "--font-rib-ui" ? "rib-ui" : "rib-display",
      };
    }),
  };
});

vi.mock("next/font/local", () => ({ default: localFont }));

import RootLayout, { metadata } from "./layout";

describe("root layout", () => {
  it("attaches the local UI and display font variables to the body", () => {
    const markup = renderToStaticMarkup(<RootLayout><p>Run It Back</p></RootLayout>);

    expect(markup).toContain('<body class="rib-ui rib-display">');
    expect(fontOptions).toContainEqual({
      src: [
        { path: "./fonts/Barlow-Regular.ttf", weight: "400", style: "normal" },
        { path: "./fonts/Barlow-Medium.ttf", weight: "500", style: "normal" },
        { path: "./fonts/Barlow-SemiBold.ttf", weight: "600", style: "normal" },
      ],
      variable: "--font-rib-ui",
      display: "swap",
    });
    expect(fontOptions).toContainEqual({
      src: [
        { path: "./fonts/BarlowCondensed-SemiBold.ttf", weight: "600", style: "normal" },
        { path: "./fonts/BarlowCondensed-Bold.ttf", weight: "700", style: "normal" },
      ],
      variable: "--font-rib-display",
      display: "swap",
    });
    expect(markup).toContain('Run It Back was created under Riot Games&#x27; &quot;Legal Jibber Jabber&quot; policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.');
    expect(metadata.description).toBe("Draft event-specific Champions player cards, choose an IGL, and run a fantasy tournament.");
    expect(metadata.icons).toEqual({ icon: "/assets/brand/run-it-back-icon.png" });
  });
});
