import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Top9 Hire",
  description: "Paste nine games. Get a roast of the taste.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
