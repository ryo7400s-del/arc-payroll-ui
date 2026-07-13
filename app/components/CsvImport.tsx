"use client";
import { useState } from "react";
import { createWalletClient, createPublicClient, custom, http, parseUnits, encodeFunctionData } from "viem";
import { arcTestnet } from "../lib/employeeBatch";

const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const USDC_ABI = [
  { type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },
] as const;
const MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as `0x${string}`;
const MULTICALL3FROM_ABI = [{
  type:"function", name:"aggregate3",
  inputs:[{name:"calls",type:"tuple[]",components:[
    {name:"target",type:"address"},{name:"allowFailure",type:"bool"},{name:"callData",type:"bytes"}
  ]}],
  outputs:[{name:"returnData",type:"tuple[]",components:[
    {name:"success",type:"bool"},{name:"returnData",type:"bytes"}
  ]}]
}] as const;

type Row = {
  label: string; to: string; amount: string; interval: number;
  firstExecution?: bigint; useEURC: boolean;
  isWhitelisted?: boolean;
  status: "pending"|"success"|"error"; error?: string;
};

export default function CsvImport({ address, scheduler, abi, getPrivyProvider, privyWallets, isPrivyConnected, isCircleConnected, circleUserToken, circleWalletId, circleEncryptionKey }: {
  address: string; scheduler: `0x${string}`; abi: any;
  getPrivyProvider?: () => Promise<any>;
  privyWallets?: any[];
  isPrivyConnected?: boolean;
  isCircleConnected?: boolean;
  circleUserToken?: string;
  circleWalletId?: string;
  circleEncryptionKey?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n").slice(1);
      const intervalMap: Record<string,number> = {
        "weekly":604800, "bi-weekly":1209600, "monthly":2592000, "quarterly":7776000
      };
      const parsed: Row[] = lines.map(line => {
        const [label, to, amount, intervalStr, dateStr, currencyStr] = line.split(",").map(s => s.trim());
        let firstExecution: bigint | undefined;
        if (dateStr) {
          const d = dateStr.toLowerCase();
          const t = new Date(); t.setUTCHours(0,0,0,0);
          if (d === "today") firstExecution = BigInt(Math.floor(t.getTime()/1000));
          else if (d === "tomorrow") { t.setUTCDate(t.getUTCDate()+1); firstExecution = BigInt(Math.floor(t.getTime()/1000)); }
          else if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(dateStr)) {
            const normalized = dateStr.replace(/\//g, "-");
            const parts = normalized.split("-").map(p => p.padStart(2, "0"));
            const isoDate = `${parts[0]}-${parts[1]}-${parts[2]}`;
            const parsedDate = new Date(isoDate + "T00:00:00Z");
            if (!isNaN(parsedDate.getTime())) firstExecution = BigInt(Math.floor(parsedDate.getTime()/1000));
          }
        }
        return {
          label: label || "Employee", to: to || "", amount: amount || "0",
          interval: intervalMap[intervalStr?.toLowerCase()] || 2592000,
          firstExecution, useEURC: currencyStr?.toLowerCase() === "eurc",
          status: "pending" as const,
        };
      }).filter(r => r.to.startsWith("0x"));
      setRows(parsed);
      setDone(false);
      // Check whitelist status asynchronously
      const pc2 = createPublicClient({ chain: arcTestnet, transport: http() });
      Promise.all(parsed.map(async (r, idx) => {
        if (!r.to.startsWith("0x")) return;
        try {
          const isWl = await pc2.readContract({
            address: scheduler, abi, functionName: "isWhitelisted",
            args: [address as `0x${string}`, r.to as `0x${string}`]
          }) as boolean;
          setRows(prev => prev.map((row, i) => i === idx ? { ...row, isWhitelisted: isWl } : row));
        } catch {}
      }));
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
        // Approve Check
        setPhase("Checking allowance…");
        const totalNeeded = rows.reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0);
        const allowanceRes = await fetch("/api/circle-check-allowance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerAddress: address, schedulerAddress: scheduler, requiredAmount: totalNeeded.toString() }),
        });
        const { needsApprove } = await allowanceRes.json();

        if (needsApprove) {
          setPhase("Approving USDC…");
          const approveRes = await fetch("/api/circle-approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken: circleUserToken, walletId: circleWalletId, schedulerAddress: scheduler }),
          });
          const approveData = await approveRes.json();
          if (approveData.error) throw new Error(approveData.error);
          await executeSdk(approveData.challengeId);
        }

        // each row: Schedule creation (whitelist must be pre-registered in Setting tab)
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          setPhase(`Creating schedule ${i+1}/${rows.length}: ${r.label}…`);
          const schedRes = await fetch("/api/circle-schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userToken: circleUserToken,
              walletId: circleWalletId,
              schedulerAddress: scheduler,
              to: r.to,
              amount: r.amount,
              interval: r.interval,
              label: r.label,
              firstExecution: (r.firstExecution ?? 0n).toString(),
              useEURC: r.useEURC,
            }),
          });
          const schedData = await schedRes.json();
          if (schedData.error) throw new Error(schedData.error);
          await executeSdk(schedData.challengeId);

          setRows(prev => prev.map((row, idx) => idx === i ? { ...row, status: "success" } : row));
        }
      } catch (e: any) {
        setRows(prev => prev.map(r => r.status === "pending" ? { ...r, status: "error", error: e.message?.slice(0,50) } : r));
      }

      setPhase("");
      setRunning(false);
      setDone(true);
      return;
    }

    if (!(window as any).ethereum && !(isPrivyConnected && privyWallets)) { setRunning(false); return; }
    const pc = createPublicClient({ chain: arcTestnet, transport: http() });
    let wc;
    if (isPrivyConnected && privyWallets) {
      const embWallet = privyWallets.find((w: any) => w.walletClientType === "privy");
      if (embWallet) {
        await embWallet.switchChain(5042002);
        const provider = await embWallet.getEthereumProvider();
        wc = createWalletClient({ account: address as `0x${string}`, chain: arcTestnet, transport: custom(provider) });
      }
    }
    if (!wc) {
      wc = createWalletClient({ account: address as `0x${string}`, chain: arcTestnet, transport: custom((window as any).ethereum) });
    }

    // Step1: Approve
    setPhase("Approving USDC…");
    const totalNeeded = rows.reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0);
    const allowance = await pc.readContract({ address: USDC, abi: USDC_ABI, functionName: "allowance", args: [address as `0x${string}`, scheduler] }) as bigint;
    if (allowance < parseUnits(String(totalNeeded * 12), 6)) {
      const ah = await wc.writeContract({ address: USDC, abi: USDC_ABI, functionName: "approve", args: [scheduler, parseUnits("1000000", 6)] });
      await pc.waitForTransactionReceipt({ hash: ah });
    }

    // Step2: Check whitelist status — NOT whitelisted rows are skipped, never auto-registered here.
    // Whitelisting must be done explicitly in the Setting tab (single or CSV whitelist import).
    setPhase("Checking whitelist…");
    const notWhitelisted: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const isWl = await pc.readContract({ address: scheduler, abi, functionName: "isWhitelisted", args: [address as `0x${string}`, rows[i].to as `0x${string}`] }) as boolean;
      if (!isWl) notWhitelisted.push(i);
    }

    if (notWhitelisted.length > 0) {
      setRows(prev => prev.map((r, idx) =>
        notWhitelisted.includes(idx)
          ? { ...r, status: "error", error: "Not whitelisted — add in Setting tab first" }
          : r
      ));
    }

    const scheduleRows = rows
      .map((r, idx) => ({ r, idx }))
      .filter(({ idx }) => !notWhitelisted.includes(idx));

    if (scheduleRows.length === 0) {
      setPhase("");
      setRunning(false);
      setDone(true);
      return;
    }

    // Step3: Batch schedule creation (whitelisted rows only)
    setPhase(`Creating ${scheduleRows.length} schedules (1 TX)…`);
    try {
      const scheduleCalls = scheduleRows.map(({ r }) => ({
        target: scheduler,
        allowFailure: false,
        callData: encodeFunctionData({
          abi, functionName: "createSchedule",
          args: [r.to as `0x${string}`, parseUnits(r.amount, 6), BigInt(r.interval), r.label, r.firstExecution ?? 0n, r.useEURC],
        }),
      }));
      const hash = await wc.writeContract({ address: MULTICALL3FROM, abi: MULTICALL3FROM_ABI, functionName: "aggregate3", args: [scheduleCalls] });
      await pc.waitForTransactionReceipt({ hash });
      const successIdx = new Set(scheduleRows.map(({ idx }) => idx));
      setRows(prev => prev.map((r, idx) => successIdx.has(idx) ? { ...r, status: "success" } : r));
    } catch(e: any) {
      const targetIdx = new Set(scheduleRows.map(({ idx }) => idx));
      setRows(prev => prev.map((r, idx) => targetIdx.has(idx) ? { ...r, status: "error", error: e.message?.slice(0,50) } : r));
    }

    setPhase("");
    setRunning(false);
    setDone(true);
  };

  return (
    <div className="card" style={{marginTop:16}}>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:12}}>CSV Bulk Import</div>
      <div style={{fontSize:11,color:"#8ab4cc",marginBottom:6}}>
        CSV format: <span style={{color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>Label, Address, Amount, Interval, Date, Currency</span>
      </div>
      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:4}}>Interval: weekly/bi-weekly/monthly/quarterly</div>
      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:4}}>Date: today / tomorrow / YYYY-MM-DD (optional)</div>
      <div style={{fontSize:10,color:"#a78bfa",marginBottom:12}}>Currency: USDC (default) / EURC (Auto-swap)</div>
      <input type="file" accept=".csv" onChange={handleFile} style={{fontSize:11,color:"#8ab4cc",marginBottom:12,display:"block"}}/>
      {rows.length > 0 && (
        <>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,maxHeight:200,overflowY:"auto"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.1fr 45px 65px 45px 75px 55px",gap:6,padding:"4px 8px",borderBottom:"1px solid #0e1b28"}}>
              {["Name","Address","USDC","Interval","Curr","Date","Status"].map(h=>(
                <span key={h} style={{fontSize:9,color:"#8ab4cc",textTransform:"uppercase",letterSpacing:".1em"}}>{h}</span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1.1fr 45px 65px 45px 75px 55px",gap:6,padding:"6px 8px",background:"#070e18",borderRadius:4,border:"1px solid #0e1b28",alignItems:"center"}}>
                <span style={{fontSize:11,color:"#8ab4cc"}}>{r.label}</span>
                <span style={{fontSize:10,color:"#3dd6f5",fontFamily:"DM Mono,monospace",display:"flex",alignItems:"center",gap:4}}>
                  {r.to.slice(0,8)}…
                  {r.isWhitelisted !== undefined && (
                    <span style={{fontSize:10}}>{r.isWhitelisted ? "✅" : "❌"}</span>
                  )}
                </span>
                <span style={{fontSize:11,color:"#00e5a0"}}>{r.amount}</span>
                <span style={{fontSize:10,color:"#a78bfa"}}>{r.interval===604800?"Weekly":r.interval===1209600?"Bi-weekly":r.interval===2592000?"Monthly":"Quarterly"}</span>
                <span style={{fontSize:10,color:r.useEURC?"#a78bfa":"#3dd6f5"}}>{r.useEURC?"EURC":"USDC"}</span>
                <span style={{fontSize:9,color:"#8ab4cc"}}>
                  {r.firstExecution ? new Date(Number(r.firstExecution)*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "ASAP"}
                </span>
                <span style={{fontSize:9,color:r.status==="success"?"#00e5a0":r.status==="error"?"#ff4d6d":"#8ab4cc"}}>
                  {r.status==="success"?"✓":r.status==="error"?"✗ "+(r.error||""):"…"}
                </span>
              </div>
            ))}
          </div>
          {phase && <div style={{fontSize:10,color:"#3dd6f5",marginBottom:8}}><span className="spinning">◌</span> {phase}</div>}
          <button className="submit-btn" onClick={handleImport} disabled={running||done}>
            {running ? <><span className="spinning">◌</span> Processing…</>
            : done ? "✓ Import Complete"
            : `🚀 Import ${rows.length} Schedules (Batch TX) →`}
          </button>
        </>
      )}
    </div>
  );
}
