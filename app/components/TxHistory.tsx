"use client";
import { useState, useEffect } from "react";

const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
} as const;

const SCHEDULE_EXECUTED = "0x" + Array.from(
  new Uint8Array(
    (() => { const enc = new TextEncoder(); return enc.encode("ScheduleExecuted(address,address,uint256,bytes32)"); })()
  )
).map(b => b.toString(16).padStart(2,"0")).join("");

type TxItem = {
  type: "schedule" | "x402";
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: string;
};

export default function TxHistory({ address, scheduler, publicClient }: {
  address: string;
  scheduler: `0x${string}`;
  publicClient: any;
}) {
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // KV に保存された永続履歴を取得
      const kvRes = await fetch(`/api/get-execution-history?owner=${address}`);
      const kvData = await kvRes.json();
      const kvItems: TxItem[] = (kvData.items || []).map((r: any) => ({
        type: "schedule" as const,
        from: r.owner,
        to: r.recipient,
        amount: (Number(r.amount) / 1e6).toFixed(2),
        txHash: r.txHash,
        blockNumber: "0",
      }));

      const latestBlock = await publicClient.getBlockNumber();
      const [scheduleLogs, x402Logs] = await Promise.all([
        publicClient.getLogs({
          address: scheduler,
          event: {
            type: "event",
            name: "ScheduleExecuted",
            inputs: [
              { type:"address", name:"owner", indexed:true },
              { type:"address", name:"recipient", indexed:true },
              { type:"uint256", name:"amount" },
              { type:"bytes32", name:"txRef" },
            ]
          },
          fromBlock: latestBlock - 9000n > 0n ? latestBlock - 9000n : 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: scheduler,
          event: {
            type: "event",
            name: "X402PaymentExecuted",
            inputs: [
              { type:"address", name:"payer", indexed:true },
              { type:"address", name:"merchant", indexed:true },
              { type:"uint256", name:"amount" },
              { type:"bytes32", name:"nonce" },
            ]
          },
          fromBlock: latestBlock - 9000n > 0n ? latestBlock - 9000n : 0n,
          toBlock: "latest",
        }),
      ]);

      const items: TxItem[] = [
        ...scheduleLogs.map((log: any) => ({
          type: "schedule" as const,
          from: log.args.owner,
          to: log.args.recipient,
          amount: (Number(log.args.amount) / 1e6).toFixed(2),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber.toString(),
        })),
        ...x402Logs.map((log: any) => ({
          type: "x402" as const,
          from: log.args.payer,
          to: log.args.merchant,
          amount: (Number(log.args.amount) / 1e6).toFixed(2),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber.toString(),
        })),
      ];

      // KV とオンチェーンの重複を txHash で除去してマージ
      const seen = new Set(items.map(i => i.txHash));
      const merged = [...items, ...kvItems.filter(i => !seen.has(i.txHash))];

      setTxs(merged);
    } catch(e) { console.error("[TxHistory] ERROR:", e); }
    setLoading(false);
  };

  useEffect(() => { if (address) fetchHistory(); }, [address, scheduler]);

  const short = (s: string) => s ? `${s.slice(0,8)}…${s.slice(-4)}` : "";

  return (
    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase"}}>
          Transaction History
        </div>
        <button onClick={fetchHistory} style={{background:"none",border:"1px solid #1a2a3a",color:"#3dd6f5",fontSize:9,padding:"2px 8px",borderRadius:3,cursor:"pointer"}}>
          ↻ Refresh
        </button>
      </div>
      {loading && <div style={{fontSize:11,color:"#4a6070",padding:"20px 0",textAlign:"center"}}>Loading…</div>}
      {!loading && txs.length === 0 && (
        <div style={{fontSize:11,color:"#4a6070",padding:"20px 0",textAlign:"center"}}>No transactions yet.</div>
      )}
      {!loading && txs.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"60px 1fr 1fr 70px 60px",gap:8,padding:"4px 10px",borderBottom:"1px solid #0e1b28"}}>
            {["Type","From","To","USDC","TX"].map(h => (
              <span key={h} style={{fontSize:9,color:"#2e5070",letterSpacing:".1em",textTransform:"uppercase"}}>{h}</span>
            ))}
          </div>
          {txs.map((tx, i) => (
            <div key={i} style={{display:"grid",gridTemplateColumns:"60px 1fr 1fr 70px 60px",gap:8,padding:"8px 10px",background:"#070e18",borderRadius:4,border:"1px solid #0e1b28",alignItems:"center"}}>
              <span style={{fontSize:10,color:tx.type==="x402"?"#a78bfa":"#3dd6f5",padding:"2px 6px",background:tx.type==="x402"?"#a78bfa18":"#3dd6f518",borderRadius:3,textAlign:"center"}}>
                {tx.type==="x402"?"x402":"AUTO"}
              </span>
              <span style={{fontSize:11,color:"#8ab4cc",fontFamily:"DM Mono,monospace",whiteSpace:"nowrap",overflow:"hidden"}}>{short(tx.from)}</span>
              <span style={{fontSize:11,color:"#8ab4cc",fontFamily:"DM Mono,monospace",whiteSpace:"nowrap",overflow:"hidden"}}>{short(tx.to)}</span>
              <span style={{fontSize:11,color:"#00e5a0",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{tx.from.toLowerCase() === address.toLowerCase() ? tx.amount : "****"}</span>
              <a href={`https://testnet.arcscan.app/tx/${tx.txHash}`} target="_blank" rel="noreferrer"
                style={{fontSize:10,color:"#3dd6f5",textDecoration:"none"}}>↗ View</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
