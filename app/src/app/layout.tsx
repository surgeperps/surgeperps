// Why: Next.js needs one root layout; it sets fonts, metadata and wraps every
//      page in the wallet/data providers and the shared header.
// How: loads Inter and JetBrains Mono through next/font (self-hosted, no
//      layout shift) and exposes them as CSS variables used in globals.css.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { THEME_SCRIPT } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jb", display: "swap" });

export const metadata: Metadata = {
  title: "SurgePerps · Trade Solana's congestion",
  description: "A live on-chain index of what Solana blockspace costs, and a perp to hedge or trade it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Header />
          <main className="page">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
