import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const ribUi = localFont({
  src: [
    { path: "./fonts/Barlow-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Barlow-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Barlow-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-rib-ui",
  display: "swap",
});

const ribDisplay = localFont({
  src: [
    { path: "./fonts/BarlowCondensed-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/BarlowCondensed-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-rib-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Run It Back",
  description: "Draft event-specific Champions player cards, choose an IGL, and run a fantasy tournament.",
  icons: { icon: "/assets/brand/run-it-back-icon.png" },
};

export function LegalNotice() {
  return <footer className="legal-notice">Run It Back was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.</footer>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${ribUi.variable} ${ribDisplay.variable}`}>{children}<LegalNotice /></body>
    </html>
  );
}
