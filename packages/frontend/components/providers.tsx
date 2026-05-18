"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { http } from "viem";
import { mainnet } from "wagmi/chains";
import { robinhoodTestnet } from "../lib/addresses";

const config = getDefaultConfig({
  appName: "ChainScore",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [robinhoodTestnet, mainnet],
  transports: {
    [robinhoodTestnet.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
