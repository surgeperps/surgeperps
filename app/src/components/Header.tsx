"use client";
// Why: the same top bar on every page: brand, the app sections and docs, which
//      network you're on, and the wallet button.
// How: highlights the current route; shows a "Demo feed" badge when the
//      programs aren't deployed on this cluster so nobody mistakes it for live data;
//      the sun/moon button switches between light and dark themes.
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { CLUSTER, LANDING_URL } from "@/lib/config";
import { useSurge } from "./SurgeData";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

// the wallet button reads window; render it client-side only
const WalletMultiButton = dynamic(async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton, { ssr: false });

const NAV = [
  { href: "/", label: "Index" },
  { href: "/trade", label: "Trade" },
  { href: "/hedge", label: "Hedge" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const path = usePathname();
  const { mode } = useSurge();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <a className="brand" href={LANDING_URL}><Logo /> SurgePerps</a>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>{n.label}</Link>
          ))}
        </nav>
        <div className="topbar-right">
          {mode === "demo" && <span className="badge warn" title="Oracle not found on this cluster: showing a simulated feed">Demo feed</span>}
          <span className="badge">{CLUSTER === "mainnet-beta" ? "Mainnet" : CLUSTER === "localnet" ? "Localnet" : "Devnet"}</span>
          <ThemeToggle />
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
