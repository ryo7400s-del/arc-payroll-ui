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
      <button className="disconnect-btn" onClick={logout} title={wallet.address}>
        ✅ {shortAddr(wallet.address)}
      </button>
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
