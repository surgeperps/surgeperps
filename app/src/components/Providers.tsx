"use client";
// Why: wallet connection, the RPC connection, live Surge data and toasts are
//      needed on every page, so they wrap the whole app once.
// How: polyfills Buffer for Anchor in the browser, then nests the Solana
//      ConnectionProvider + WalletProvider (Phantom, Solflare, Backpack… are
//      found automatically via the Wallet Standard), the wallet modal, our
//      SurgeData feed, Kai (the pet, who hears every toast) and the toast stack.
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import type { ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_URL } from "@/lib/config";
import { SurgeData } from "./SurgeData";
import { Toasts } from "./Toasts";
import { PetProvider } from "./pet/PetProvider";
import { Pet } from "./pet/Pet";
import { PetWatcher } from "./pet/PetWatcher";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      {/* errors are shown as toasts (useTrader); log quietly instead of the dev error overlay */}
      <WalletProvider wallets={[]} autoConnect onError={(e) => console.warn(e)}>
        <WalletModalProvider>
          <SurgeData>
            <PetProvider>
              <Toasts>{children}</Toasts>
              <PetWatcher />
              <Pet />
            </PetProvider>
          </SurgeData>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
