"use client";
import { createContext, useContext } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

export type PrivyWalletState = {
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  login: () => void;
  logout: () => void;
  getProvider: () => Promise<ethers.BrowserProvider | null>;
};

const PrivyWalletContext = createContext<PrivyWalletState>({
  isConnected: false,
  isLoading: false,
  address: null,
  login: () => {},
  logout: () => {},
  getProvider: async () => null,
});

export function PrivyWalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
  const address = embeddedWallet?.address ?? null;

  const getProvider = async () => {
    if (!embeddedWallet) return null;
    const provider = await embeddedWallet.getEthereumProvider();
    return new ethers.BrowserProvider(provider);
  };

  return (
    <PrivyWalletContext.Provider value={{
      isConnected: authenticated && !!embeddedWallet,
      isLoading: !ready,
      address,
      login,
      logout,
      getProvider,
    }}>
      {children}
    </PrivyWalletContext.Provider>
  );
}

export function usePrivyWallet() {
  return useContext(PrivyWalletContext);
}
