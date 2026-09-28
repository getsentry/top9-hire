import type { Metadata } from "next";
import { League_Gothic, Public_Sans } from "next/font/google";
import { Backdrop } from "./backdrop";
import "./globals.css";

const body = Public_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

const stamp = League_Gothic({
  subsets: ["latin"],
  variable: "--font-stamp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Top9 Hire",
  description: "Nine games in. One hire archetype out. Skip the LeetCode.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${stamp.variable}`}>
      <body>
        <Backdrop />
        {children}
      </body>
    </html>
  );
}
