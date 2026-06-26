"use client";
import { usePrivyWallet } from "@/lib/privy/PrivyWalletContext";

export default function PrivyLoginButton() {
  const { isConnected, isLoading, address, login, logout } = usePrivyWallet();

  if (isLoading) return null;

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10, color: "#a78bfa", fontFamily: "monospace" }}>
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(address)}
          style={{ background: "none", border: "1px solid #a78bfa", borderRadius: 4, color: "#a78bfa", fontSize: 9, padding: "2px 6px", cursor: "pointer" }}
        >
          Copy
        </button>
        <button
          onClick={logout}
          style={{ background: "none", border: "1px solid #4a6070", borderRadius: 4, color: "#4a6070", fontSize: 9, padding: "2px 6px", cursor: "pointer" }}
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      style={{ background: "#a78bfa22", border: "1px solid #a78bfa", borderRadius: 6, color: "#a78bfa", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}
    >
      Google Login
    </button>
  );
}

