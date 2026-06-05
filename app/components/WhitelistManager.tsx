"use client";
import { useState, useEffect } from "react";
import { createWalletClient, custom } from "viem";

const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
} as const;

export default function WhitelistManager({ address, scheduler, abi, publicClient }: {
  address: string;
  scheduler: `0x${string}`;
  abi: any;
  publicClient: any;
}) {
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWhitelist = async () => {
    setLoading(true);
    try {
      const list = await publicClient.readContract({
        address: scheduler, abi,
        functionName: "getWhitelist",
        args: [address as `0x${string}`],
      }) as string[];
      setMembers(list);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchWhitelist(); }, [address, scheduler]);

  const handleRemove = async (addr: string) => {
    if (!(window as any).ethereum) return;
    const wc = createWalletClient({ account: address as `0x${string}`, chain: arcTestnet, transport: custom((window as any).ethereum) });
    try {
      const h = await wc.writeContract({ address: scheduler, abi, functionName: "removeFromWhitelist", args: [addr as `0x${string}`] });
      await publicClient.waitForTransactionReceipt({ hash: h });
      alert("✅ Removed: " + addr);
      fetchWhitelist();
    } catch(e:any) { alert("Failed: " + e.message); }
  };

  if (loading) return <div style={{fontSize:11,color:"#4a6070"}}>Loading…</div>;
  if (members.length === 0) return <div style={{fontSize:11,color:"#4a6070"}}>No members whitelisted.</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {members.map((m) => (
        <div key={m} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:"#070e18",borderRadius:4,border:"1px solid #0e1b28"}}>
          <span style={{fontSize:11,color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>{m.slice(0,10)}…{m.slice(-6)}</span>
          <button onClick={()=>handleRemove(m)} style={{background:"#1a0a0a",border:"1px solid #ff4d6d",color:"#ff4d6d",fontSize:10,padding:"4px 10px",borderRadius:3,cursor:"pointer"}}>
            Remove
          </button>
        </div>
      ))}
      <button onClick={fetchWhitelist} style={{background:"none",border:"1px solid #1a2a3a",color:"#3dd6f5",fontSize:10,padding:"4px 10px",borderRadius:3,cursor:"pointer",marginTop:4}}>
        ↻ Refresh
      </button>
    </div>
  );
}
