import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run It Back",
  description: "Draft Champions players and run the bracket.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
