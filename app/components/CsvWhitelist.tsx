"use client";
import { useState } from "react";
import { createWalletClient, custom, encodeFunctionData } from "viem";

const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
} as const;

const MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as `0x${string}`;
const MULTICALL3FROM_ABI = [{
  type:"function", name:"aggregate3",
  inputs:[{name:"calls",type:"tuple[]",components:[
    {name:"target",type:"address"},
    {name:"allowFailure",type:"bool"},
    {name:"callData",type:"bytes"}
  ]}],
  outputs:[{name:"returnData",type:"tuple[]",components:[
    {name:"success",type:"bool"},
    {name:"returnData",type:"bytes"}
  ]}]
}] as const;

type Row = { label: string; address: string; status: "pending"|"success"|"skipped"|"error"; error?: string };

export default function CsvWhitelist({ ownerAddress, scheduler, abi, publicClient, getPrivyProvider, isPrivyConnected, privyWallets, isCircleConnected, circleUserToken, circleWalletId, circleEncryptionKey }: {
  ownerAddress: string;
  scheduler: `0x${string}`;
  abi: any;
  getPrivyProvider?: () => Promise<any>;
  isPrivyConnected?: boolean;
  privyWallets?: any[];
  publicClient: any;
  isCircleConnected?: boolean;
  circleUserToken?: string;
  circleWalletId?: string;
  circleEncryptionKey?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n").slice(1);
      const parsed: Row[] = lines.map(line => {
        const [label, address] = line.split(",").map(s => s.trim());
        return { label: label || "Employee", address: address || "", status: "pending" as const };
      }).filter(r => r.address.startsWith("0x"));
      setRows(parsed);
      setDone(false);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setRunning(true);

    // Circle wallet-specific flow
    if (isCircleConnected && circleUserToken && circleWalletId && circleEncryptionKey) {
      const executeSdk = async (challengeId: string) => {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        const sdk = new W3SSdk();
        sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
        sdk.setAuthentication({ userToken: circleUserToken, encryptionKey: circleEncryptionKey });
        await new Promise<void>((resolve, reject) => {
          sdk.execute(challengeId, (err: any) => {
            if (err) reject(new Error(err.message));
            else resolve();
          });
        });
      };

      try {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const isWl = await publicClient.readContract({
            address: scheduler, abi, functionName: "isWhitelisted",
            args: [ownerAddress as `0x${string}`, r.address as `0x${string}`],
          }) as boolean;
          if (isWl) {
            setRows(prev => prev.map((row, idx) => idx === i ? { ...row, status: "skipped" } : row));
            continue;
          }
          const res = await fetch("/api/circle-whitelist-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken: circleUserToken, walletId: circleWalletId, schedulerAddress: scheduler, targetAddress: r.address }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          await executeSdk(data.challengeId);
          setRows(prev => prev.map((row, idx) => idx === i ? { ...row, status: "success" } : row));
        }
      } catch (e: any) {
        setRows(prev => prev.map(r => r.status === "pending" ? { ...r, status: "error", error: e.message?.slice(0,50) } : r));
      }
      setRunning(false);
      setDone(true);
      return;
    }

    let wc;
    if (isPrivyConnected && privyWallets) {
      const embWallet = privyWallets.find((w: any) => w.walletClientType === "privy");
      if (!embWallet) { alert("Privy wallet not found"); setRunning(false); return; }
      await embWallet.switchChain(5042002);
      const provider = await embWallet.getEthereumProvider();
      wc = createWalletClient({ account: ownerAddress as `0x${string}`, chain: arcTestnet, transport: custom(provider) });
    } else {
      if (!(window as any).ethereum) { setRunning(false); return; }
      wc = createWalletClient({ account: ownerAddress as `0x${string}`, chain: arcTestnet, transport: custom((window as any).ethereum) });
    }

    // Check existing registrations
    const toRegister: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const isWl = await publicClient.readContract({
        address: scheduler, abi, functionName: "isWhitelisted",
        args: [ownerAddress as `0x${string}`, rows[i].address as `0x${string}`],
      }) as boolean;
      if (isWl) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: "skipped" } : r));
      } else {
        toRegister.push(i);
      }
    }

    if (toRegister.length === 0) {
      setRunning(false);
      setDone(true);
      return;
    }

    try {
      // for batchcalls creation
      const calls = toRegister.map(i => ({
        target: scheduler,
        allowFailure: false,
        callData: encodeFunctionData({
          abi,
          functionName: "addToWhitelist",
          args: [rows[i].address as `0x${string}`],
        }),
      }));

      // register all in 1 TX
      const hash = await wc.writeContract({
        address: MULTICALL3FROM,
        abi: MULTICALL3FROM_ABI,
        functionName: "aggregate3",
        args: [calls],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // allsuccess update
      setRows(prev => prev.map((r, idx) =>
        toRegister.includes(idx) ? { ...r, status: "success" } : r
      ));
    } catch(e: any) {
      setRows(prev => prev.map((r, idx) =>
        toRegister.includes(idx) ? { ...r, status: "error", error: e.message?.slice(0,50) } : r
      ));
    }

    setRunning(false);
    setDone(true);
  };

  return (
    <div className="card" style={{marginTop:16}}>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:12}}>
        CSV Whitelist Import
      </div>
      <div style={{fontSize:11,color:"#8ab4cc",marginBottom:6}}>
        CSV format: <span style={{color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>Label, Address</span>
      </div>
      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:12}}>
        Already registered addresses are auto-skipped · all in 1 TX
      </div>
      <input type="file" accept=".csv" onChange={handleFile}
        style={{fontSize:11,color:"#8ab4cc",marginBottom:12,display:"block"}}/>
      {rows.length > 0 && (
        <>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,maxHeight:200,overflowY:"auto"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 60px",gap:6,padding:"4px 8px",borderBottom:"1px solid #0e1b28"}}>
              {["Name","Address","Status"].map(h=>(
                <span key={h} style={{fontSize:9,color:"#8ab4cc",textTransform:"uppercase",letterSpacing:".1em"}}>{h}</span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 60px",gap:6,padding:"6px 8px",background:"#070e18",borderRadius:4,border:"1px solid #0e1b28",alignItems:"center"}}>
                <span style={{fontSize:11,color:"#8ab4cc"}}>{r.label}</span>
                <span style={{fontSize:10,color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>{r.address.slice(0,8)}…{r.address.slice(-4)}</span>
                <span style={{fontSize:10,color:r.status==="success"?"#00e5a0":r.status==="error"?"#ff4d6d":r.status==="skipped"?"#a78bfa":"#4a6070"}}>
                  {r.status==="success"?"✓":r.status==="error"?"✗":r.status==="skipped"?"↷":"…"}
                </span>
              </div>
            ))}
          </div>
          <button className="submit-btn" onClick={handleImport} disabled={running||done}>
            {running ? <><span className="spinning">◌</span> Processing…</>
            : done ? "✓ Complete"
            : `📋 Whitelist ${rows.length} Addresses (1 TX) →`}
          </button>
        </>
      )}
    </div>
  );
}
