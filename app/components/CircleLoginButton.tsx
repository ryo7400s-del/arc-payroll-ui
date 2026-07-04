"use client";
import { useCircleWallet } from "@/lib/circle/CircleWalletContext";

export default function CircleLoginButton() {
  const { wallet, isConnected, isLoading, error, login, logout } = useCircleWallet();

  const shortAddr = (addr: string) => addr.slice(0,6)+"..."+addr.slice(-4);

  if (isLoading) {
    return <button className="connect-btn" disabled>⏳ Connecting...</button>;
  }

  if (isConnected && wallet) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10, color: "#a78bfa", fontFamily: "monospace" }}>{shortAddr(wallet.address)}</div>
        <button
          onClick={() => navigator.clipboard.writeText(wallet.address)}
          style={{ background: "none", border: "1px solid #a78bfa", borderRadius: 4, color: "#a78bfa", fontSize: 9, padding: "2px 6px", cursor: "pointer" }}
        >
          Copy
        </button>
        <button className="disconnect-btn" onClick={logout}>✕</button>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      <button className="connect-btn" onClick={async()=>{ alert("login called"); await login(); }}>
        Circle
      </button>
      {error && <span style={{color:"#ff4d6d",fontSize:10,marginTop:3}}>{error}</span>}
    </div>
  );
}
