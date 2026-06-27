"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { PrivyWalletProvider } from "@/lib/privy/PrivyWalletContext";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

export default function PrivyProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["google"],
        appearance: { theme: "dark" },
        embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
      }}
    >
      <PrivyWalletProvider>
        {children}
      </PrivyWalletProvider>
    </PrivyProvider>
  );
}
