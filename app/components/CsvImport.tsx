"use client";
import { useState } from "react";
import { createWalletClient, createPublicClient, custom, http, parseUnits } from "viem";

const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
} as const;

const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const USDC_ABI = [
  { type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },
] as const;

type Row = { label: string; to: string; amount: string; interval: number; status: "pending"|"success"|"error"; error?: string };

export default function CsvImport({ address, scheduler, abi }: {
  address: string;
  scheduler: `0x${string}`;
  abi: any;
}) {
  const [rows, setRows]     = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone]     = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n").slice(1); // ヘッダースキップ
      const parsed: Row[] = lines.map(line => {
        const [label, to, amount, intervalStr] = line.split(",").map(s => s.trim());
        const intervalMap: Record<string,number> = {
          "weekly":604800, "bi-weekly":1209600, "monthly":2592000, "quarterly":7776000
        };
        return {
          label: label || "Employee",
          to: to || "",
          amount: amount || "0",
          interval: intervalMap[intervalStr?.toLowerCase()] || 2592000,
          status: "pending",
        };
      }).filter(r => r.to.startsWith("0x"));
      setRows(parsed);
      setDone(false);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows.length || !(window as any).ethereum) return;
    setRunning(true);
    const wc = createWalletClient({ account: address as `0x${string}`, chain: arcTestnet, transport: custom((window as any).ethereum) });
    const pc = createPublicClient({ chain: arcTestnet, transport: http() });

    // 一括approve
    const totalAmount = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    try {
      const allowance = await pc.readContract({ address:USDC, abi:USDC_ABI, functionName:"allowance", args:[address as `0x${string}`, scheduler] }) as bigint;
      if (allowance < parseUnits(String(totalAmount * 12), 6)) {
        const ah = await wc.writeContract({ address:USDC, abi:USDC_ABI, functionName:"approve", args:[scheduler, parseUnits("1000000", 6)] });
        await pc.waitForTransactionReceipt({ hash: ah });
      }
    } catch(e: any) { setRunning(false); return; }

    // 順番にcreateSchedule
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const h = await wc.writeContract({
          address: scheduler, abi,
          functionName: "createSchedule",
          args: [row.to as `0x${string}`, parseUnits(row.amount, 6), BigInt(row.interval), row.label],
        });
        await pc.waitForTransactionReceipt({ hash: h });
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: "success" } : r));
      } catch(e: any) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: e.message?.slice(0,50) } : r));
      }
    }
    setRunning(false);
    setDone(true);
  };

  return (
    <div className="card" style={{marginTop:16}}>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:12}}>
        CSV Bulk Import
      </div>
      <div style={{fontSize:11,color:"#4a6070",marginBottom:8}}>
        CSV format: <span style={{color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>Label, Address, Amount(USDC), Interval</span>
      </div>
      <div style={{fontSize:10,color:"#2e5070",marginBottom:12}}>
        Interval options: weekly / bi-weekly / monthly / quarterly
      </div>
      <input type="file" accept=".csv" onChange={handleFile}
        style={{fontSize:11,color:"#8ab4cc",marginBottom:12,display:"block"}}/>
      {rows.length > 0 && (
        <>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,maxHeight:200,overflowY:"auto"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 60px 80px 60px",gap:6,padding:"4px 8px",borderBottom:"1px solid #0e1b28"}}>
              {["Name","Address","USDC","Interval","Status"].map(h=>(
                <span key={h} style={{fontSize:9,color:"#2e5070",textTransform:"uppercase",letterSpacing:".1em"}}>{h}</span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 60px 80px 60px",gap:6,padding:"6px 8px",background:"#070e18",borderRadius:4,border:"1px solid #0e1b28",alignItems:"center"}}>
                <span style={{fontSize:11,color:"#8ab4cc"}}>{r.label}</span>
                <span style={{fontSize:10,color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>{r.to.slice(0,8)}…</span>
                <span style={{fontSize:11,color:"#00e5a0"}}>{r.amount}</span>
                <span style={{fontSize:10,color:"#a78bfa"}}>{r.interval===604800?"Weekly":r.interval===1209600?"Bi-weekly":r.interval===2592000?"Monthly":"Quarterly"}</span>
                <span style={{fontSize:10,color:r.status==="success"?"#00e5a0":r.status==="error"?"#ff4d6d":"#4a6070"}}>
                  {r.status==="success"?"✓":r.status==="error"?"✗":"…"}
                </span>
              </div>
            ))}
          </div>
          <button className="submit-btn" onClick={handleImport} disabled={running||done}>
            {running ? <><span className="spinning">◌</span> Importing {rows.filter(r=>r.status==="success").length}/{rows.length}…</>
            : done ? "✓ Import Complete"
            : `🚀 Import ${rows.length} Schedules →`}
          </button>
        </>
      )}
    </div>
  );
}
