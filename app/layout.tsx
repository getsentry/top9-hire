import type { Metadata, Viewport } from "next";
import { Fragment_Mono, Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "top9.wtf — Is it a match?",
  description: "Forget LeetCode. Drop your Top 9 and a job link, and Jev decides whether you fit the role.",
  openGraph: {
    title: "Nine games. Zero LeetCode.",
    description: "Match your Top 9 with a real job posting and get a hiring verdict.",
    siteName: "top9.wtf",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nine games. Zero LeetCode.",
    description: "Match your Top 9 with a real job posting and get a hiring verdict.",
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F2E9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
