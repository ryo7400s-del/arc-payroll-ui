"use client";
import { addEmployeesBatch } from "./lib/employeeBatch";
import WhitelistManager from "./components/WhitelistManager";
import CsvWhitelist from "./components/CsvWhitelist";
import SetupWizard from "./components/SetupWizard";
import TxHistory from "./components/TxHistory";
import CsvImport from "./components/CsvImport";
import DeployContract from "./components/DeployContract";
import { useState, useEffect, useCallback } from "react";
import { createWalletClient, createPublicClient, custom, http, parseUnits } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
} as const;

const DEFAULT_SCHEDULER = "0xe4150530084e49aff57fa91d6d3c207be6271c27" as `0x${string}`;
const USDC      = "0x3600000000000000000000000000000000000000" as `0x${string}`;

const SCHEDULER_ABI = [
  { type:"function", name:"createSchedule",
    inputs:[{name:"recipient",type:"address"},{name:"amount",type:"uint256"},{name:"interval",type:"uint256"},{name:"label",type:"string"},{name:"firstExecution",type:"uint256"},{name:"useEURC",type:"bool"}],
    outputs:[{name:"",type:"uint96"}] },
  { type:"function", name:"executeSchedule",
    inputs:[{name:"owner",type:"address"},{name:"index",type:"uint256"}],
    outputs:[{name:"txRef",type:"bytes32"}] },
  { type:"function", name:"canExecute",
    inputs:[{name:"owner",type:"address"},{name:"index",type:"uint256"}],
    outputs:[{name:"ok",type:"bool"},{name:"reason",type:"string"}] },
  { type:"function", name:"getSchedules",
    inputs:[{name:"owner",type:"address"}],
    outputs:[{name:"",type:"tuple[]",components:[
      {name:"id",type:"uint96"},{name:"recipient",type:"address"},
      {name:"amount",type:"uint256"},{name:"interval",type:"uint256"},
      {name:"nextExecution",type:"uint256"},{name:"active",type:"bool"},
      {name:"label",type:"string"},
    ]}] },
  { type:"function", name:"addToWhitelist", inputs:[{name:"addr",type:"address"}], outputs:[] },
  { type:"function", name:"getWhitelist", inputs:[{name:"owner",type:"address"}], outputs:[{name:"",type:"address[]"}] },
  { type:"function", name:"removeFromWhitelist", inputs:[{name:"addr",type:"address"}], outputs:[] },
  { type:"function", name:"toggleSchedule", inputs:[{name:"index",type:"uint256"}], outputs:[] },
  { type:"function", name:"isWhitelisted", inputs:[{name:"owner",type:"address"},{name:"addr",type:"address"}], outputs:[{name:"",type:"bool"}] },
  { type:"function", name:"weeklyRemaining",
    inputs:[{name:"owner",type:"address"}], outputs:[{name:"",type:"uint256"}] },
] as const;

const USDC_ABI = [
  { type:"function", name:"approve",
    inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],
    outputs:[{type:"bool"}] },
  { type:"function", name:"allowance",
    inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}],
    outputs:[{type:"uint256"}] },
  { type:"function", name:"balanceOf",
    inputs:[{name:"account",type:"address"}],
    outputs:[{type:"uint256"}] },
] as const;

const INTERVALS = [
  { label:"Weekly",    seconds:604800   },
  { label:"Bi-weekly", seconds:1209600  },
  { label:"Monthly",   seconds:2592000  },
  { label:"Quarterly", seconds:7776000  },
];

function shortAddr(addr: string) {
  return addr ? addr.slice(0,6)+"..."+addr.slice(-4) : "";
}

type TxState = "idle"|"approving"|"creating"|"executing"|"success"|"error";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});
function X402Send({ address }: { address: string }) {
  const [state, setState] = useState<"idle"|"step1"|"signing"|"paying"|"done"|"error">("idle");
  const [x402Info, setX402Info] = useState<any>(null);
  const [txHash, setTxHash] = useState("");
  const [data, setData] = useState<any>(null);
  const [errMsg, setErrMsg] = useState("");
  const [content, setContent] = useState("payroll-report");
  const [x402Merchant, setX402Merchant] = useState("");
  const [x402Amount, setX402Amount] = useState("1");

  const handleFlow = async () => {
    if (!(window as any).ethereum) return;
    setState("step1");
    try {
      // Step1: GET /api/x402 → 402レスポンス受け取る
      const merchantAddr = x402Merchant || "0x2032C2aC5cdB02b2e0D46e015Af991C257edd388";
      const amountUsdc = String(Math.round(parseFloat(x402Amount||"1") * 1_000_000));
      console.log("DEBUG: merchantAddr=", merchantAddr, "amountUsdc=", amountUsdc);
      const r1 = await fetch(`/api/x402?amount=${amountUsdc}&merchant=${merchantAddr}`);
      const info = await r1.json();
      setX402Info(info.x402);

      // Step2: 署名
      setState("signing");
      const { createWalletClient, createPublicClient, custom, http, parseUnits, keccak256, encodeAbiParameters, parseAbiParameters, toBytes } = await import("viem");
      const arc = { id:5042002, name:"Arc Testnet", nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18}, rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}, blockExplorers:{default:{name:"ArcScan",url:"https://testnet.arcscan.app"}} } as const;
      const wc = createWalletClient({ account:address as `0x${string}`, chain:arc, transport:custom((window as any).ethereum) });
      const pc = createPublicClient({ chain:arc, transport:http() });
      const MERCHANT = info.x402.merchant as `0x${string}`;
      const USDC2 = "0x3600000000000000000000000000000000000000" as `0x${string}`;
      const amount = BigInt(info.x402.amount);
      const nonce  = BigInt(Date.now());
      const expiry = BigInt(Math.floor(Date.now()/1000)+300);
      const innerHash = keccak256(encodeAbiParameters(parseAbiParameters("address, address, uint256, uint256, uint256"), [address as `0x${string}`, MERCHANT, amount, expiry, nonce]));
      const signature = await wc.signMessage({ message:{ raw: toBytes(innerHash) } });

      // Step3: USDC approve + executeX402Payment
      setState("paying");
      const SCHED = "0xe4150530084e49aff57fa91d6d3c207be6271c27" as `0x${string}`;
      const USDC_ABI = [{ type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },{ type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}] }] as const;
      const X402_ABI = [{ type:"function", name:"executeX402Payment", inputs:[{ name:"req", type:"tuple", components:[{name:"payer",type:"address"},{name:"merchant",type:"address"},{name:"amount",type:"uint256"},{name:"expiry",type:"uint256"},{name:"nonce",type:"uint256"},{name:"signature",type:"bytes"}]}], outputs:[] }] as const;
      const allowance = await pc.readContract({ address:USDC2, abi:USDC_ABI, functionName:"allowance", args:[address as `0x${string}`, SCHED] }) as bigint;
      if (allowance < amount) {
        const ah = await wc.writeContract({ address:USDC2, abi:USDC_ABI, functionName:"approve", args:[SCHED, parseUnits("100",6)] });
        await pc.waitForTransactionReceipt({ hash:ah });
      }
      const hash = await wc.writeContract({ address:SCHED, abi:X402_ABI, functionName:"executeX402Payment", args:[{ payer:address as `0x${string}`, merchant:MERCHANT, amount, expiry, nonce, signature:signature as `0x${string}` }] });
      await pc.waitForTransactionReceipt({ hash });
      setTxHash(hash);

      // Step4: POST /api/x402 → コンテンツ取得
      const r2 = await fetch("/api/x402", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ payer:address, amount:info.x402.amount, expiry:expiry.toString(), nonce:nonce.toString(), signature, content }) });
      const result = await r2.json();
      if (!result.success) throw new Error(result.error);
      setData(result.data);
      setState("done");
    } catch(e:any) { setErrMsg(e.message||"Failed"); setState("error"); setTimeout(()=>setState("idle"),6000); }
  };

  if (state==="done"&&data) return (
    <div className="success-pop">
      <div style={{fontSize:10,color:"#00e5a0",marginBottom:12,letterSpacing:".1em"}}>✓ x402 PAYMENT VERIFIED · CONTENT UNLOCKED</div>
      {"employees" in data ? (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {data.employees.map((e:any,i:number)=>(
            <div key={i} style={{background:"#070e18",border:"1px solid #0e1b28",borderRadius:4,padding:"10px 12px"}}>
              <div style={{fontSize:11,color:"#8ab4cc"}}>{e.label}</div>
              <div style={{fontSize:14,color:"#3dd6f5",fontWeight:700,marginTop:4}}>{e.amount} USDC</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[["Transactions",data.totalTransactions],["Volume",data.totalVolume+" USDC"],["Avg",data.avgPayment+" USDC"]].map(([k,v],i)=>(
            <div key={i} style={{background:"#070e18",border:"1px solid #0e1b28",borderRadius:4,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#8ab4cc"}}>{k}</div>
              <div style={{fontSize:13,color:"#3dd6f5",fontWeight:700,marginTop:4}}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:10,color:"#3dd6f5",marginTop:8}}><a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{color:"#3dd6f5"}}>View TX on ArcScan →</a></div>
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:4}}>Select Content</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
        {[["payroll-report","Payroll Report"],["analytics","Analytics"]].map(([v,l])=>(
          <button key={v} onClick={()=>setContent(v)} style={{background:content===v?"#0d1f35":"#0c1520",border:`1px solid ${content===v?"#3dd6f5":"#1a2a3a"}`,color:content===v?"#3dd6f5":"#4a6070",fontFamily:"DM Mono,monospace",fontSize:11,padding:"10px",borderRadius:4,cursor:"pointer"}}>{l}</button>
        ))}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div><div style={{fontSize:10,color:"#8ab4cc",marginBottom:4}}>Merchant Address (optional)</div><input className="input-field" placeholder="0x... (default: self)" value={x402Merchant} onChange={e=>setX402Merchant(e.target.value)}/></div>
        <div><div style={{fontSize:10,color:"#8ab4cc",marginBottom:4}}>Amount (USDC)</div><input className="input-field" placeholder="1.00" type="number" value={x402Amount} onChange={e=>setX402Amount(e.target.value)}/></div>
      </div>
      </div>
      {state==="error"&&<div style={{fontSize:11,color:"#ff4d6d",wordBreak:"break-all"}}>{errMsg}</div>}
      <button className="submit-btn" onClick={handleFlow} disabled={state!=="idle"}>
        {state==="step1"?<><span className="spinning">◌</span> Requesting…</>
        :state==="signing"?<><span className="spinning">◌</span> Signing…</>
        :state==="paying"?<><span className="spinning">◌</span> Paying 1 USDC…</>
  :`Pay ${x402Amount||"1"} USDC · Access via x402 →`}
      </button>
    </div>
  );
}

function X402Report({ address }: { address: string }) {
  const [state, setState] = useState<"idle"|"paying"|"loading"|"done"|"error">("idle");
  const [report, setReport] = useState<any>(null);
  const [errMsg, setErrMsg] = useState("");
  const handlePay = async () => {
    if (!(window as any).ethereum) return;
    setState("paying");
    try {
      const { createWalletClient, createPublicClient, custom, http, parseUnits } = await import("viem");
      const arc = { id:5042002, name:"Arc Testnet", nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18}, rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}, blockExplorers:{default:{name:"ArcScan",url:"https://testnet.arcscan.app"}} } as const;
      const wc = createWalletClient({ account: address as `0x${string}`, chain: arc, transport: custom((window as any).ethereum) });
      const pc = createPublicClient({ chain: arc, transport: http() });
      const USDC2 = "0x3600000000000000000000000000000000000000" as `0x${string}`;
      const RECV = "0x2032C2aC5cdB02b2e0D46e015Af991C257edd388" as `0x${string}`;
      const ABI2 = [{ type:"function", name:"transfer", inputs:[{name:"to",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] }] as const;
      const hash = await wc.writeContract({ address:USDC2, abi:ABI2, functionName:"transfer", args:[RECV, parseUnits("1",6)] });
      await pc.waitForTransactionReceipt({ hash });
      setState("loading");
      const res = await fetch(`/api/report?payer=${address}&tx=${hash}`);
      const data = await res.json();
      if (res.status === 402) throw new Error(data.error);
      setReport(data.report);
      setState("done");
    } catch(e: any) { setErrMsg(e.message||"Failed"); setState("error"); setTimeout(()=>setState("idle"),5000); }
  };
  if (state==="done" && report) return (
    <div className="success-pop">
      <div style={{fontSize:10,color:"#00e5a0",marginBottom:12,letterSpacing:".1em"}}>✓ PAYMENT VERIFIED · REPORT UNLOCKED</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {report.employees.map((e:any,i:number)=>(
          <div key={i} style={{background:"#070e18",border:"1px solid #0e1b28",borderRadius:4,padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"#8ab4cc"}}>{e.label}</div>
            <div style={{fontSize:14,color:"#3dd6f5",fontWeight:700,marginTop:4}}>{e.amount} USDC</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:10,color:"#8ab4cc"}}>Total: <span style={{color:"#ffd166"}}>{report.totalDisbursed} USDC</span> · {report.month}</div>
    </div>
  );
  return (
    <button className="submit-btn" onClick={handlePay} disabled={state!=="idle"}>
      {state==="paying"?<><span className="spinning">◌</span> Sending 1 USDC…</>
      :state==="loading"?<><span className="spinning">◌</span> Verifying on-chain…</>
      :state==="error"?`Error: ${errMsg}`
      :"Pay 1 USDC · Unlock Report (x402) →"}
    </button>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:(active?"#00e5a0":"#ff4d6d")+"18", color:active?"#00e5a0":"#ff4d6d", borderRadius:4, padding:"2px 9px", fontSize:11, fontWeight:600 }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:active?"#00e5a0":"#ff4d6d", display:"inline-block" }}/>
      {active ? "Active" : "Paused"}
    </span>
  );
}

export default function ArcPayroll() {
  const [address, setAddress] = useState<`0x${string}`|null>(null);
  const [SCHEDULER, setSCHEDULER] = useState<`0x${string}`>(DEFAULT_SCHEDULER);
  const [hasDeployedContract, setHasDeployedContract] = useState(false);
  const [balance,   setBalance]   = useState<string|null>(null);
  const [connecting,setConnecting]= useState(false);
  const [activeTab, setActiveTab] = useState("schedule");
  const [scanLine,  setScanLine]  = useState(0);
  const [txState,   setTxState]   = useState<TxState>("idle");
  const [txHash,    setTxHash]    = useState("");
  const [txError,   setTxError]   = useState("");
  const [schedules, setSchedules] = useState<any[]>([]);
  const [whitelistCount, setWhitelistCount] = useState(0);
  const [weeklyLeft,setWeeklyLeft]= useState<string|null>(null);
  const [form, setForm] = useState({ to:"", amount:"", interval:2592000, label:"", firstExecution:"", useEURC:false });

  useEffect(() => {
    const t = setInterval(()=>setScanLine(s=>(s+1)%100), 60);
    return ()=>clearInterval(t);
  }, []);

  const getWalletClient = useCallback(() => {
    if (typeof window === "undefined" || !(window as any).ethereum || !address) return null;
    return createWalletClient({
      account: address,
      chain: arcTestnet,
      transport: custom((window as any).ethereum),
    });
  }, [address, SCHEDULER]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("No wallet found. Please open in MetaMask browser.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = await ((window as any).ethereum).request({ method:"eth_requestAccounts" });
      const addr = accounts[0] as `0x${string}`;
      setAddress(addr);
      const saved = localStorage.getItem(`payroll_contract_${addr}`);
      if (saved) { setSCHEDULER(saved as `0x${string}`); setHasDeployedContract(true); }
      // switch to Arc Testnet
     try {
        await (window as any).ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x4CE8B2" }],
        });
      } catch {
        try {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x4CE8B2",
              chainName: "Arc Testnet",
              nativeCurrency: { name:"USDC", symbol:"USDC", decimals:18 },
              rpcUrls: ["https://rpc.testnet.arc.network"],
              blockExplorerUrls: ["https://testnet.arcscan.app"],
            }],
          });
          await (window as any).ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x4CE8B2" }],
          });
        } catch(e2) { console.log("chain setup:", e2); }
      }
     
      // fetch USDC balance
      const raw = await publicClient.readContract({
        address:USDC, abi:USDC_ABI, functionName:"balanceOf", args:[addr],
      }) as bigint;
      setBalance((Number(raw)/1_000_000).toLocaleString("en-US",{minimumFractionDigits:2}));
    } catch(e:any) {
      alert("Connect failed: "+e.message);
    }
    setConnecting(false);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null); setBalance(null); setSchedules([]);
  }, []);

  const fetchSchedules = useCallback(async () => {
    if (!address) return;
    try {
      const rows = await publicClient.readContract({
        address:SCHEDULER, abi:SCHEDULER_ABI, functionName:"getSchedules", args:[address],
      }) as any[];
      setSchedules(rows);
      const rem = await publicClient.readContract({
        address:SCHEDULER, abi:SCHEDULER_ABI, functionName:"weeklyRemaining", args:[address],
      }) as bigint;
      setWeeklyLeft((Number(rem)/1_000_000).toLocaleString("en-US",{minimumFractionDigits:2}));
      const wl = await publicClient.readContract({ address:SCHEDULER, abi:SCHEDULER_ABI, functionName:"getWhitelist", args:[address] }) as any[];
      setWhitelistCount(wl.length);
    } catch(e) { console.error(e); }
  }, [address, SCHEDULER]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleCreate = useCallback(async () => {
    if (!address || !form.to || !form.amount) return;
    setTxState("approving"); setTxError("");
    try {
      const fe = form.firstExecution ? BigInt(Math.floor(new Date(form.firstExecution).getTime()/1000)) : 0n;
      await addEmployeesBatch(
        [{ label: form.label||"Employee", to: form.to as `0x${string}`, amount: form.amount, interval: form.interval, firstExecution: fe, useEURC: form.useEURC }],
        address, SCHEDULER, SCHEDULER_ABI, publicClient,
        (_i, status, error, hash) => {
          if (status === "scheduling") setTxState("creating");
          if (status === "done" && hash) setTxHash(hash);
          if (status === "error") throw new Error(error || "Failed");
        }
      );
      setTxState("success");
      await fetchSchedules();
      setTimeout(()=>{ setTxState("idle"); setTxHash(""); setForm({to:"",amount:"",interval:2592000,label:"",firstExecution:"",useEURC:false}); }, 6000);
    } catch(e:any) {
      setTxError(e.message||"Failed");
      setTxState("error");
      setTimeout(()=>setTxState("idle"), 5000);
    }
  }, [address, form, getWalletClient, fetchSchedules]);

  const handleExecute = useCallback(async (index: number) => {
    const wc = typeof window !== "undefined" && (window as any).ethereum ? createWalletClient({ account: address!, chain: arcTestnet, transport: custom((window as any).ethereum) }) : null;
    if (!wc || !address) return;
    setTxState("executing"); setTxError("");
    try {
      const [ok, reason] = await publicClient.readContract({
        address:SCHEDULER, abi:SCHEDULER_ABI, functionName:"canExecute", args:[address, BigInt(index)],
      }) as [boolean, string];
      if (!ok) throw new Error(reason);
      const hash = await wc.writeContract({
        address:SCHEDULER, abi:SCHEDULER_ABI, functionName:"executeSchedule", args:[address, BigInt(index)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setTxState("success");
      await fetchSchedules();
      setTimeout(()=>{ setTxState("idle"); setTxHash(""); }, 6000);
    } catch(e:any) {
      setTxError(e.message||"Failed");
      setTxState("error");
      setTimeout(()=>setTxState("idle"), 5000);
    }
  }, [address, getWalletClient, fetchSchedules]);

  const totalMonthly = schedules.filter(s=>s.active).reduce((sum,s)=>{
    const base = Number(s.amount)/1_000_000;
    const mult = Number(s.interval)<=604800?4:Number(s.interval)<=1209600?2:Number(s.interval)>=7776000?0.33:1;
    return sum+base*mult;
  }, 0);
  return (
    <div style={{ minHeight:"100vh", background:"#080b10", fontFamily:"'DM Mono','Fira Mono',monospace", color:"#c8d6e5", position:"relative", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#0d1118;}
        ::-webkit-scrollbar-thumb{background:#1e2d3d;border-radius:2px;}
        .nav-btn{background:none;border:none;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:7px 16px;border-radius:3px;transition:all .15s;}
        .nav-btn.active{background:#0d1f35;color:#3dd6f5;}
        .nav-btn:not(.active){color:#4a6070;}
        .nav-btn:not(.active):hover{color:#8ba0b0;}
        .connect-btn{background:linear-gradient(135deg,#0a3d62,#1a5276);border:1px solid #2e86c1;color:#3dd6f5;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:8px 18px;border-radius:4px;cursor:pointer;transition:all .2s;}
        .connect-btn:hover{border-color:#3dd6f5;color:#fff;}
        .connect-btn:disabled{opacity:.5;cursor:not-allowed;}
        .disconnect-btn{background:#0c1520;border:1px solid #162030;color:#4a6070;font-family:'DM Mono',monospace;font-size:10px;padding:5px 8px;border-radius:3px;cursor:pointer;transition:all .15s;}
        .disconnect-btn:hover{border-color:#ff4d6d44;color:#ff4d6d;}
        .input-field{background:#0c1520;border:1px solid #1a2a3a;color:#c8d6e5;font-family:'DM Mono',monospace;font-size:13px;padding:11px 14px;border-radius:4px;outline:none;width:100%;transition:border-color .2s;}
        .input-field::placeholder{color:#2e4255;}
        .input-field:focus{border-color:#3dd6f5;}
        .select-field{background:#0c1520;border:1px solid #1a2a3a;color:#c8d6e5;font-family:'DM Mono',monospace;font-size:13px;padding:11px 14px;border-radius:4px;outline:none;width:100%;cursor:pointer;appearance:none;transition:border-color .2s;}
        .select-field:focus{border-color:#3dd6f5;}
        .submit-btn{background:linear-gradient(135deg,#0a3d62,#1a5276);border:1px solid #2e86c1;color:#3dd6f5;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:13px 28px;border-radius:4px;cursor:pointer;width:100%;transition:all .2s;font-weight:500;}
        .submit-btn:hover:not(:disabled){background:linear-gradient(135deg,#0d4f80,#1f618d);border-color:#3dd6f5;color:#fff;}
        .submit-btn:disabled{opacity:.4;cursor:not-allowed;}
        .exec-btn{background:none;border:1px solid #2e86c144;color:#3dd6f5;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;padding:5px 12px;border-radius:3px;cursor:pointer;transition:all .15s;}
        .exec-btn:hover{border-color:#3dd6f5;background:#0d1f35;}
        .exec-btn:disabled{opacity:.3;cursor:not-allowed;}
        .card{background:#0b1520;border:1px solid #162030;border-radius:6px;padding:20px 22px;}
        .stat-card{background:#0b1520;border:1px solid #162030;border-radius:6px;padding:18px 20px;position:relative;overflow:hidden;}
        .row-item{display:grid;gap:10px;align-items:center;padding:11px 14px;border-radius:4px;font-size:12px;border-bottom:1px solid #0e1b28;transition:background .12s;}
        .row-item:hover{background:#0e1c2a;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes successPop{0%{opacity:0;transform:scale(.94);}60%{transform:scale(1.02);}100%{opacity:1;transform:scale(1);}}
        .animate-in{animation:fadeIn .3s ease both;}
        .success-pop{animation:successPop .35s ease both;}
        .spinning{animation:spin 1s linear infinite;display:inline-block;}
      `}</style>

      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(61,214,245,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(61,214,245,.025) 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
      <div style={{position:"fixed",left:0,right:0,height:1,zIndex:1,pointerEvents:"none",top:`${scanLine}%`,background:"linear-gradient(90deg,transparent,rgba(61,214,245,.07),transparent)",transition:"top .06s linear"}}/>
      <div style={{position:"fixed",top:-200,right:-100,width:600,height:600,background:"radial-gradient(circle,rgba(13,79,130,.18),transparent 70%)",pointerEvents:"none",zIndex:0}}/>

      <div style={{position:"relative",zIndex:2,maxWidth:1020,margin:"0 auto",padding:"0 24px 80px"}}>
        <div style={{paddingTop:36,paddingBottom:24,borderBottom:"1px solid #111e2b",marginBottom:28,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:10}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,letterSpacing:".04em",color:"#fff"}}>ARC</span>
              <span style={{fontSize:11,color:"#3dd6f5",letterSpacing:".18em",textTransform:"uppercase",fontWeight:500}}>PAYROLL</span>
            </div>
            <div style={{marginTop:5,fontSize:11,color:"#8ab4cc",letterSpacing:".06em"}}>Enterprise-grade · tamper-proof · on-chain payroll</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#00e5a0",animation:"pulse 2s infinite"}}/>
              <span style={{fontSize:10,color:"#00e5a0",letterSpacing:".1em"}}>ARC TESTNET · 5042002</span>
            </div>
            {!address ? (
                <button className="connect-btn" onClick={connect} disabled={connecting}>
                  {connecting?"Connecting…":"MetaMask"}
                </button>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{textAlign:"right"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{fontSize:11,color:"#3dd6f5",fontWeight:500}}>{shortAddr(address)}</div>
                  </div>
                  <div style={{fontSize:10,color:"#8ab4cc"}}>{balance??"-"} USDC</div>
                </div>
                <button className="disconnect-btn" onClick={disconnect}>✕</button>
              </div>
            )}
          </div>
        </div>
        


        <div style={{marginBottom:28,padding:"12px 18px",background:"linear-gradient(90deg,#071929,#091e30)",border:"1px solid #0f2235",borderRadius:5,display:"flex",alignItems:"center",gap:16}}>
          <span style={{fontSize:11,color:"#3dd6f5"}}>⬡</span>
          <span style={{fontSize:11,color:"#4a7090",lineHeight:1.7}}>
            <span style={{color:"#8ab4cc"}}>Cryptographic signature × smart contract enforcement</span>
            {" "}— no intermediaries, no impersonation, no tampering. Every disbursement recorded immutably on Arc Testnet.
          </span>
        </div>

        <div style={{display:"flex",gap:4,marginBottom:28,background:"#090f18",padding:4,borderRadius:5,width:"fit-content"}}>
          {[["schedule","Setting"],["dashboard","Create Schedule"],["history","Dashboard"]].map(([k,l])=>(
            <button key={k} className={`nav-btn${activeTab===k?" active":""}`} onClick={()=>setActiveTab(k)}>{l}</button>
          ))}
        </div>

        {activeTab==="dashboard" && (
          <div className="animate-in">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:24}}>
              {[
                {label:"Monthly Disbursement",value:`$${totalMonthly.toLocaleString("en-US",{minimumFractionDigits:2})}`,unit:"USDC est.",accent:"#3dd6f5"},
                {label:"Active Schedules",value:schedules.filter(s=>s.active).length,unit:"employees",accent:"#a78bfa"},
                {label:"Weekly Remaining",value:weeklyLeft??"-",unit:"USDC",accent:"#ffd166"},
              ].map((s,i)=>(
                <div key={i} className="stat-card">
                  <div style={{fontSize:10,color:"#8ab4cc",letterSpacing:".1em",textTransform:"uppercase",marginBottom:10}}>{s.label}</div>
                  <div style={{fontSize:22,fontFamily:"'Syne',sans-serif",fontWeight:700,color:s.accent,fontVariantNumeric:"tabular-nums"}}>{s.value}</div>
                  <div style={{fontSize:10,color:"#8ab4cc",marginTop:3}}>{s.unit}</div>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${s.accent}55,transparent)`}}/>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>Create Payment Schedule</div>
              {!address && (
                <div style={{padding:"28px 0",textAlign:"center"}}>
                  <div style={{color:"#8ab4cc",fontSize:12,marginBottom:14}}>Open in MetaMask browser and connect wallet</div>
                  <button className="connect-btn" onClick={connect} disabled={connecting}>{connecting?"Connecting…":"Connect Wallet"}</button>
                </div>
              )}
              {address && txState==="success" && (
                <div className="success-pop" style={{padding:"32px 0",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:10,color:"#00e5a0"}}>✓</div>
                  <div style={{color:"#00e5a0",fontSize:12,letterSpacing:".1em"}}>Success</div>
                  <div style={{color:"#8ab4cc",fontSize:11,marginTop:6}}>Signed · broadcast · on-chain confirmed</div>
                  {txHash && <div style={{marginTop:10,fontSize:10}}><a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{color:"#3dd6f5"}}>View on ArcScan →</a></div>}
                </div>
              )}
              {address && txState==="error" && (
                <div style={{padding:"20px 0",textAlign:"center"}}>
                  <div style={{color:"#ff4d6d",fontSize:12,marginBottom:6}}>Failed</div>
                  <div style={{color:"#8ab4cc",fontSize:11,maxWidth:400,margin:"0 auto",wordBreak:"break-all"}}>{txError}</div>
                </div>
              )}
              {address && !["success","error"].includes(txState) && (
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div>
                      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:6}}>Recipient Address</div>
                      <input className="input-field" placeholder="0x..." value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:6}}>Label</div>
                      <input className="input-field" placeholder="e.g. Alice M." value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}/>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div>
                      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:6}}>Amount (USDC)</div>
                      <input className="input-field" placeholder="0.00" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:6}}>Interval</div>
                      <select className="select-field" value={form.interval} onChange={e=>setForm(f=>({...f,interval:Number(e.target.value)}))}>
                        {INTERVALS.map(v=><option key={v.seconds} value={v.seconds}>{v.label}</option>)}
                      </select>
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:10,color:"#8ab4cc",marginBottom:6}}>First Payment Date (optional)</div>
                    <input type="date" className="input-field" value={form.firstExecution} onChange={e=>setForm(f=>({...f,firstExecution:e.target.value}))} min={new Date().toISOString().split("T")[0]} style={{colorScheme:"dark"}}/>
                  </div>
                  <div style={{marginTop:12,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:10,color:"#8ab4cc"}}>受取通貨：</div>
                    <button onClick={()=>setForm(f=>({...f,useEURC:false}))} style={{padding:"4px 12px",borderRadius:3,fontSize:11,cursor:"pointer",background:!form.useEURC?"#3dd6f5":"none",color:!form.useEURC?"#070e18":"#8ab4cc",border:"1px solid #3dd6f5"}}>USDC</button>
                    <button onClick={()=>setForm(f=>({...f,useEURC:true}))} style={{padding:"4px 12px",borderRadius:3,fontSize:11,cursor:"pointer",background:form.useEURC?"#a78bfa":"none",color:form.useEURC?"#070e18":"#8ab4cc",border:"1px solid #a78bfa"}}>EURC 🇪🇺</button>
                    {form.useEURC && <span style={{fontSize:10,color:"#a78bfa"}}>USDCをCurveで自動スワップ</span>}
                  </div>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:"#1e3a50",borderTop:"1px solid #0e1b28",paddingTop:12,lineHeight:1.7}}>
                    <span style={{color:"#8ab4cc"}}>Flow: </span>
                    approve USDC → createSchedule on-chain → executeSchedule when due
                  </div>
                  <button className="submit-btn" onClick={handleCreate} disabled={txState!=="idle"||!form.to||!form.amount}>
                    {txState==="approving"?<><span className="spinning">◌</span> Approving USDC…</>
                    :txState==="creating"?<><span className="spinning">◌</span> Creating Schedule…</>
                    :"Create Schedule →"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab==="dashboard" && address && (
          <div className="animate-in" style={{marginTop:16}}>
            <CsvImport address={address!} scheduler={SCHEDULER} abi={SCHEDULER_ABI} />
            <div className="card" style={{marginTop:16}}>
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>⬡ x402 Payroll Report</div>
              <div style={{fontSize:11,color:"#4a7090",marginBottom:16,lineHeight:1.7}}>Pay <span style={{color:"#3dd6f5"}}>1 USDC</span> to unlock this month&apos;s payroll report — powered by HTTP 402 Payment Required protocol.</div>
              <X402Send address={address} />
            </div>
          </div>
        )}


        {activeTab==="schedule" && (
          <div className="animate-in">
            <DeployContract onDeployed={(addr) => { setSCHEDULER(addr as `0x${string}`); localStorage.setItem(`payroll_contract_${address}`, addr); setHasDeployedContract(true); }} />
            <SetupWizard
              address={address||""}
              hasDeployed={hasDeployedContract}
              hasWhitelist={whitelistCount>0}
              hasSchedules={schedules.length>0}
              onDeploy={()=>document.querySelector<HTMLButtonElement>(".submit-btn")?.click()}
              onWhitelist={()=>{ const el = document.getElementById("wl-input"); if(el) el.scrollIntoView({behavior:"smooth"}); }}
              onSchedule={()=>setActiveTab("dashboard")}
            />
            {hasDeployedContract && (
            <>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:8}}>Active Contract</div>
              <div style={{fontSize:10,color:"#3dd6f5",wordBreak:"break-all",marginBottom:8}}>{SCHEDULER}</div>
              <input className="input-field" placeholder="0x... paste contract address to switch" onChange={e=>{ if(e.target.value.startsWith("0x")){ setSCHEDULER(e.target.value as `0x${string}`); localStorage.setItem(`payroll_contract_${address}`, e.target.value); }}}/>
              <button className="submit-btn" style={{marginTop:8}} onClick={async()=>{ if(!address) return; const wc=createWalletClient({account:address,chain:arcTestnet,transport:custom((window as any).ethereum)}); const REGISTRY="0xc01c0113e353c6fc1be7d32a80e9688e1256b81f" as `0x${string}`; const REGISTRY_ABI=[{type:"function",name:"register",inputs:[{name:"scheduler",type:"address"},{name:"name",type:"string"}],outputs:[]}] as const; try{ const h=await wc.writeContract({address:REGISTRY,abi:REGISTRY_ABI,functionName:"register",args:[SCHEDULER,"Company"]}); await publicClient.waitForTransactionReceipt({hash:h}); alert("✅ Registered: "+SCHEDULER); }catch(e:any){alert("Failed: "+e.message);} }}>Register This Contract in Registry</button>
            </div>
            <div className="card" style={{marginTop:16}}>
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>Whitelist Address</div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div>
                  <div style={{fontSize:10,color:"#8ab4cc",marginBottom:6}}>Wallet Address to Whitelist</div>
                  <input className="input-field" placeholder="0x..." id="wl-input"/>
                </div>
                <button className="submit-btn" onClick={async()=>{
                  const addr=(document.getElementById("wl-input") as HTMLInputElement).value;
                  if(!addr||!address) return;
                  const wc=createWalletClient({account:address,chain:arcTestnet,transport:custom((window as any).ethereum)});
                  try{
                    const h=await wc.writeContract({address:SCHEDULER,abi:SCHEDULER_ABI,functionName:"addToWhitelist",args:[addr as `0x${string}`]});
                    await publicClient.waitForTransactionReceipt({hash:h});
                    alert("✅ Whitelisted! " + addr);
                  }catch(e:any){alert("Failed: "+e.message);}
                }}>Add to Whitelist 2192</button>
              </div>
              <div className="card" style={{marginTop:16}}>
                <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:12}}>Whitelist Members</div>
                {address && <WhitelistManager address={address} scheduler={SCHEDULER} abi={SCHEDULER_ABI} publicClient={publicClient} />}
              </div>
            </div>

            <div style={{marginTop:14,padding:"10px 14px",border:"1px solid #0e1b28",borderRadius:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <a href={`https://testnet.arcscan.app/address/${SCHEDULER}`} target="_blank" rel="noreferrer" style={{fontSize:10,color:"#3dd6f5",textDecoration:"none"}}>{SCHEDULER.slice(0,10)}…</a>
            </div>
            <CsvWhitelist ownerAddress={address||""} scheduler={SCHEDULER} abi={SCHEDULER_ABI} publicClient={publicClient} />
            </>
            )}
          </div>
        )}
        {activeTab==="history" && address && (
          <div className="animate-in">
            <div className="card">
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>
                On-Chain Schedules
                <button onClick={fetchSchedules} style={{marginLeft:12,background:"none",border:"1px solid #1a2a3a",color:"#3dd6f5",fontSize:9,padding:"2px 8px",borderRadius:3,cursor:"pointer"}}>↻ Refresh</button>
              </div>
              {!address && <div style={{color:"#8ab4cc",fontSize:12,padding:"20px 0",textAlign:"center"}}>Connect wallet to view schedules</div>}
              {address && schedules.length===0 && <div style={{color:"#8ab4cc",fontSize:12,padding:"20px 0",textAlign:"center"}}>No schedules yet — create one in Dashboard</div>}
              {address && schedules.length>0 && (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 80px 80px 70px 90px",gap:10,padding:"6px 14px",fontSize:10,color:"#8ab4cc",marginBottom:4}}>
                    <span>Recipient</span><span>Label</span><span>Amount</span><span>Interval</span><span>Status</span><span>Action</span>
                  </div>
                  {schedules.map((row,i)=>{
                    const amt=(Number(row.amount)/1_000_000).toLocaleString("en-US",{minimumFractionDigits:2});
                    const iv=INTERVALS.find(iv=>iv.seconds===Number(row.interval))?.label??`${Number(row.interval)}s`;
                    const next=new Date(Number(row.nextExecution)*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"});
                    return (
                      <div key={i} className="row-item" style={{gridTemplateColumns:"1.2fr 1fr 80px 80px 70px 90px"}}>
                        <span style={{color:"#3dd6f5",fontSize:11}}>{shortAddr(row.recipient)}</span>
                        <span style={{color:"#8ab4cc",fontSize:11}}>{row.label}</span>
                        <span style={{fontVariantNumeric:"tabular-nums"}}>{amt}</span>
                        <span style={{color:"#a78bfa",fontSize:11}}>{iv}</span>
                        <StatusPill active={row.active}/>
                        <button className="exec-btn" onClick={()=>handleExecute(i)} disabled={txState!=="idle"}>
                          {txState==="executing"?<span className="spinning">◌</span>:`Send·${next}`}
                        </button>
                        <button className="exec-btn" style={{background:"#1a0a0a",borderColor:row.active?"#ff4d6d":"#00e5a0",color:row.active?"#ff4d6d":"#00e5a0"}} onClick={async()=>{ const wc=createWalletClient({account:address!,chain:arcTestnet,transport:custom((window as any).ethereum)}); try{ const h=await wc.writeContract({address:SCHEDULER,abi:SCHEDULER_ABI,functionName:"toggleSchedule",args:[BigInt(i)]}); await publicClient.waitForTransactionReceipt({hash:h}); fetchSchedules(); }catch(e:any){alert(e.message);} }} disabled={txState!=="idle"}>{row.active?"Pause":"Resume"}</button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            {txHash && txState==="success" && (
              <div style={{marginTop:14,padding:"12px 16px",border:"1px solid #00e5a044",borderRadius:5,display:"flex",gap:12,alignItems:"center"}}>
                <span style={{color:"#00e5a0"}}>✓</span>
                <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#3dd6f5",textDecoration:"none"}}>View TX on ArcScan →</a>
              </div>
            )}
            {txState==="error" && (
              <div style={{marginTop:14,padding:"12px 16px",border:"1px solid #ff4d6d44",borderRadius:5}}>
                <span style={{fontSize:11,color:"#ff4d6d",wordBreak:"break-all"}}>{txError}</span>
              </div>
            )}
            <div style={{marginTop:14,padding:"10px 14px",border:"1px solid #0e1b28",borderRadius:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            </div>

            <TxHistory address={address} scheduler={SCHEDULER} publicClient={publicClient} />
          </div>
        )}

      </div>
    </div>
  );
}
