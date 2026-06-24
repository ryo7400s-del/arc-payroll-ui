"use client";
import { useState } from "react";
import CircleGoogleLogin from "../components/CircleGoogleLogin";

export default function CircleTestPage() {
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");

  return (
    <div style={{padding:32,background:"#050d18",minHeight:"100vh",fontFamily:"DM Mono,monospace"}}>
      <h1 style={{color:"#3dd6f5",fontSize:16,marginBottom:24}}>Circle Wallet テスト</h1>
      <CircleGoogleLogin onConnected={(addr, tok) => {
        setAddress(addr);
        if (tok) setToken(tok);
      }} />
      {address && (
        <div style={{marginTop:24,padding:16,background:"#0a1a2a",borderRadius:8,border:"1px solid #00e5a0"}}>
          <div style={{color:"#00e5a0",fontSize:12,marginBottom:8}}>✅ 接続成功！</div>
          <div style={{color:"#3dd6f5",fontSize:11,wordBreak:"break-all",marginBottom:12}}>{address}</div>
          <button onClick={()=>navigator.clipboard.writeText(address)}
            style={{background:"none",border:"1px solid #3dd6f5",color:"#3dd6f5",padding:"4px 12px",borderRadius:3,cursor:"pointer",fontSize:10}}>
            Copy Address
          </button>
          {token && <div style={{marginTop:8,color:"#a78bfa",fontSize:10}}>Token: {token.slice(0,20)}...</div>}
        </div>
      )}
    </div>
  );
}
