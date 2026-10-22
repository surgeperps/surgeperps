// Why: Next.js requires one root layout; it wraps every page with <html> and <body>
//      and sets the site title.
// How: the app router renders each page.tsx inside {children}.

import type { ReactNode } from "react";

export const metadata = {
  title: "Surge",
  description: "The price of Solana blockspace, as an index you can trade.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
