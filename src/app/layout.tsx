import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run It Back",
  description: "Draft Champions players and run the bracket.",
};

export function LegalNotice() {
  return <footer className="legal-notice">Run It Back was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.</footer>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<LegalNotice /></body>
    </html>
  );
}
