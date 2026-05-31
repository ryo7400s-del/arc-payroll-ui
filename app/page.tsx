"use client"

import { useState, useEffect, useCallback } from "react";
import { WagmiProvider, createConfig, http, useAccount, useWalletClient, usePublicClient, useConnect, useDisconnect } from "wagmi";
import { injected, walletConnect } from "@wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keccak256, encodePacked, toBytes, parseUnits } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
};

const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected(), walletConnect({ projectId: "16ae252cb60ef79babb68adf4ca2f23d" })],
  transports: { [arcTestnet.id]: http() },
});

const queryClient = new QueryClient();

const SCHEDULER_ADDRESS = "0xdd3605558e264ceac47b219d5aface9b4f09b0aa";
const USDC_ADDRESS      = "0x3600000000000000000000000000000000000000";

const SCHEDULER_ABI = [
  { type:"function", name:"executeX402Payment",
    inputs:[{ name:"req", type:"tuple", components:[
      { name:"payer",     type:"address" },
      { name:"merchant",  type:"address" },
      { name:"amount",    type:"uint256" },
      { name:"expiry",    type:"uint256" },
      { name:"nonce",     type:"uint256" },
      { name:"signature", type:"bytes"   },
    ]}], outputs:[] },
];

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
];

const MOCK_HISTORY = [
  { id:1, to:"0xA3f1...9B2c", amount:"4,200.00", interval:"Monthly",   status:"confirmed", ts:"2026-05-30 09:14" },
  { id:2, to:"0xD84a...1F7e", amount:"3,800.00", interval:"Monthly",   status:"confirmed", ts:"2026-05-30 09:13" },
  { id:3, to:"0xB12c...4A3d", amount:"5,100.00", interval:"Bi-weekly", status:"confirmed", ts:"2026-05-16 08:00" },
  { id:4, to:"0xF77b...2C1a", amount:"2,950.00", interval:"Weekly",    status:"pending",   ts:"2026-06-01 00:00" },
];

const INITIAL_SCHEDULED = [
  { id:1, to:"0xA3f1...9B2c", label:"Alice M.", amount:"4,200.00", interval:"Monthly",   next:"Jun 30" },
  { id:2, to:"0xD84a...1F7e", label:"Bob R.",   amount:"3,800.00", interval:"Monthly",   next:"Jun 30" },
  { id:3, to:"0xF77b...2C1a", label:"Carol T.", amount:"2,950.00", interval:"Weekly",    next:"Jun 7"  },
];

const INTERVALS = ["Weekly", "Bi-weekly", "Monthly", "Quarterly"];

function shortAddr(addr: string) {
  if (!addr) return "";
  return addr.slice(0,6) + "..." + addr.slice(-4);
}

type TxState = "idle"|"signing"|"pending"|"success"|"error";
interface ScheduledRow { id:number; to:string; label:string; amount:string; interval:string; next:string; }
interface HistoryRow   { id:number; to:string; amount:string; interval:string; status:string; ts:string; }
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string,{color:string;label:string}> = {
    confirmed: { color:"#00e5a0", label:"Confirmed" },
    pending:   { color:"#ffd166", label:"Pending"   },
    failed:    { color:"#ff4d6d", label:"Failed"    },
  };
  const s = cfg[status] || { color:"#888", label:status };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:s.color+"18", color:s.color, borderRadius:4, padding:"2px 9px", fontSize:11, fontWeight:600, letterSpacing:"0.06em" }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:s.color, display:"inline-block" }} />
      {s.label}
    </span>
  );
}

function WalletBar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors }  = useConnect();
  const { disconnect }           = useDisconnect();
  const publicClient             = usePublicClient();
  const [balance, setBalance]    = useState<string|null>(null);

  useEffect(() => {
    if (!address || !publicClient) return;
    publicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address],
    }).then((raw: unknown) => {
      const val = Number(raw as bigint) / 1_000_000;
      setBalance(val.toLocaleString("en-US", { minimumFractionDigits:2 }));
    }).catch(() => setBalance(null));
  }, [address, publicClient]);

  if (!isConnected) return (
    <button className="connect-btn" onClick={() => connect({ connector: connectors[1] })}>
      Connect Wallet
    </button>
  );
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ textAlign:"right" }}>
        <div style={{ fontSize:11, color:"#3dd6f5", fontWeight:500 }}>{shortAddr(address!)}</div>
        <div style={{ fontSize:10, color:"#2e5070" }}>{balance ?? "..."} USDC</div>
      </div>
      <button className="disconnect-btn" onClick={() => disconnect()}>✕</button>
    </div>
  );
}

function ArcPayrollInner() {
  const { address, isConnected }   = useAccount();
  const { data: walletClient }     = useWalletClient();
  const publicClient               = usePublicClient();

  const [activeTab, setActiveTab]  = useState("dashboard");
  const [scanLine,  setScanLine]   = useState(0);
  const [form, setForm]            = useState({ to:"", amount:"", interval:"Monthly" });
  const [txState, setTxState]      = useState<TxState>("idle");
  const [txHash,  setTxHash]       = useState("");
  const [txError, setTxError]      = useState("");
  const [schedForm, setSchedForm]  = useState({ to:"", label:"", amount:"", interval:"Monthly" });
  const [scheduled, setScheduled]  = useState<ScheduledRow[]>(INITIAL_SCHEDULED);

  useEffect(() => {
    const t = setInterval(() => setScanLine(s => (s+1)%100), 60);
    return () => clearInterval(t);
  }, []);

  const handlePayment = useCallback(async () => {
    if (!isConnected || !walletClient || !publicClient || !address || !form.to || !form.amount) return;
    alert("debug: " + JSON.stringify({isConnected, hasWallet: !!walletClient, hasPublic: !!publicClient, address, to: form.to, amount: form.amount})); setTxState("signing"); setTxError("");
    try {
      const amount  = parseUnits(form.amount, 6);
      const nonce   = BigInt(Date.now());
      const expiry  = BigInt(Math.floor(Date.now()/1000) + 300);

      const innerHash = keccak256(encodePacked(
        ["address","address","uint256","uint256","uint256"],
        [address, form.to as `0x${string}`, amount, expiry, nonce]
      ));
      const sig = await walletClient.signMessage({ message: { raw: toBytes(innerHash) } });

      const allowance = await publicClient.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [address, SCHEDULER_ADDRESS as `0x${string}`],
      }) as bigint;

      if (allowance < amount) {
        const ah = await walletClient.writeContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: USDC_ABI,
          functionName: "approve",
          args: [SCHEDULER_ADDRESS as `0x${string}`, parseUnits("1000000", 6)],
        });
        await publicClient.waitForTransactionReceipt({ hash: ah });
      }

      setTxState("pending");
      const hash = await walletClient.writeContract({
        address: SCHEDULER_ADDRESS as `0x${string}`,
        abi: SCHEDULER_ABI,
        functionName: "executeX402Payment",
        args: [{ payer: address, merchant: form.to as `0x${string}`, amount, expiry, nonce, signature: sig as `0x${string}` }],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setTxState("success");
      setTimeout(() => { setTxState("idle"); setTxHash(""); setForm({ to:"", amount:"", interval:"Monthly" }); }, 6000);
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
      setTxState("error");
      setTimeout(() => setTxState("idle"), 4000);
    }
  }, [isConnected, walletClient, publicClient, address, form]);

  const handleAddSchedule = useCallback(() => {
    if (!schedForm.to || !schedForm.amount) return;
    const next = schedForm.interval==="Weekly" ? "Jun 7" : schedForm.interval==="Bi-weekly" ? "Jun 14" : schedForm.interval==="Quarterly" ? "Sep 30" : "Jun 30";
    setScheduled(prev => [...prev, { id:Date.now(), to:schedForm.to, label:schedForm.label||"Employee", amount:parseFloat(schedForm.amount).toLocaleString("en-US",{minimumFractionDigits:2}), interval:schedForm.interval, next }]);
    setSchedForm({ to:"", label:"", amount:"", interval:"Monthly" });
  }, [schedForm]);

  const totalMonthly = scheduled.reduce((sum, r) => {
    const base = parseFloat(r.amount.replace(/,/g,"")) || 0;
    const mult = r.interval==="Weekly" ? 4 : r.interval==="Bi-weekly" ? 2 : r.interval==="Quarterly" ? 0.33 : 1;
    return sum + base * mult;
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
      <div style={{position:"fixed",bottom:-300,left:-200,width:700,height:700,background:"radial-gradient(circle,rgba(61,214,245,.04),transparent 70%)",pointerEvents:"none",zIndex:0}}/>

      <div style={{position:"relative",zIndex:2,maxWidth:1020,margin:"0 auto",padding:"0 24px 80px"}}>
        <div style={{paddingTop:36,paddingBottom:24,borderBottom:"1px solid #111e2b",marginBottom:28,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:10}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,letterSpacing:".04em",color:"#fff"}}>ARC</span>
              <span style={{fontSize:11,color:"#3dd6f5",letterSpacing:".18em",textTransform:"uppercase",fontWeight:500}}>PAYROLL</span>
            </div>
            <div style={{marginTop:5,fontSize:11,color:"#2e5070",letterSpacing:".06em"}}>Enterprise-grade · tamper-proof · on-chain payroll</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#00e5a0",animation:"pulse 2s infinite"}}/>
              <span style={{fontSize:10,color:"#00e5a0",letterSpacing:".1em"}}>ARC TESTNET · 5042002</span>
            </div>
            <WalletBar/>
          </div>
        </div>

        <div style={{marginBottom:28,padding:"12px 18px",background:"linear-gradient(90deg,#071929,#091e30)",border:"1px solid #0f2235",borderRadius:5,display:"flex",alignItems:"center",gap:16}}>
          <span style={{fontSize:11,color:"#3dd6f5"}}>⬡</span>
          <span style={{fontSize:11,color:"#4a7090",letterSpacing:".05em",lineHeight:1.7}}>
            <span style={{color:"#8ab4cc"}}>Cryptographic signature × smart contract enforcement</span>
            {" "}— no intermediaries, no impersonation, no tampering. Every disbursement is signed by the payer&apos;s private key and recorded immutably on Arc Testnet.
          </span>
        </div>

        <div style={{display:"flex",gap:4,marginBottom:28,background:"#090f18",padding:4,borderRadius:5,width:"fit-content"}}>
          {[["dashboard","Dashboard"],["schedule","Schedule"],["history","History"]].map(([k,l]) => (
            <button key={k} className={`nav-btn${activeTab===k?" active":""}`} onClick={()=>setActiveTab(k)}>{l}</button>
          ))}
        </div>

        {activeTab==="dashboard" && (
          <div className="animate-in">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:24}}>
              {[
                {label:"Monthly Disbursement",value:`$${totalMonthly.toLocaleString("en-US",{minimumFractionDigits:2})}`,unit:"USDC",accent:"#3dd6f5"},
                {label:"Active Recipients",value:scheduled.length,unit:"employees",accent:"#a78bfa"},
                {label:"Next Payment",value:"Jun 7",unit:"scheduled",accent:"#ffd166"},
              ].map((s,i) => (
                <div key={i} className="stat-card">
                  <div style={{fontSize:10,color:"#2e5070",letterSpacing:".1em",textTransform:"uppercase",marginBottom:10}}>{s.label}</div>
                  <div style={{fontSize:24,fontFamily:"'Syne',sans-serif",fontWeight:700,color:s.accent,fontVariantNumeric:"tabular-nums"}}>{s.value}</div>
                  <div style={{fontSize:10,color:"#2e5070",marginTop:3}}>{s.unit}</div>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${s.accent}55,transparent)`}}/>
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>New Payment</div>
              {!isConnected && (
                <div style={{padding:"28px 0",textAlign:"center"}}>
                  <div style={{color:"#2e5070",fontSize:12,marginBottom:14}}>Connect your wallet to send a payment</div>
                  <WalletBar/>
                </div>
              )}
              {isConnected && txState==="success" && (
                <div className="success-pop" style={{padding:"32px 0",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:10,color:"#00e5a0"}}>✓</div>
                  <div style={{color:"#00e5a0",fontSize:12,letterSpacing:".1em"}}>Payment Sent</div>
                  <div style={{color:"#2e5070",fontSize:11,marginTop:6}}>Signed · broadcast · on-chain confirmed</div>
                  {txHash && <div style={{marginTop:10,fontSize:10,color:"#3dd6f5"}}>TX: <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{color:"#3dd6f5"}}>{txHash.slice(0,12)}…{txHash.slice(-8)}</a></div>}
                </div>
              )}
              {isConnected && txState==="error" && (
                <div style={{padding:"20px 0",textAlign:"center"}}>
                  <div style={{color:"#ff4d6d",fontSize:12,marginBottom:6}}>Transaction Failed</div>
                  <div style={{color:"#2e5070",fontSize:11}}>{txError}</div>
                </div>
              )}
              {isConnected && (txState==="idle"||txState==="signing"||txState==="pending") && (
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div>
                    <div style={{fontSize:10,color:"#2e5070",marginBottom:6,letterSpacing:".08em"}}>Recipient Wallet Address</div>
                    <input className="input-field" placeholder="0x..." value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div>
                      <div style={{fontSize:10,color:"#2e5070",marginBottom:6,letterSpacing:".08em"}}>Amount (USDC)</div>
                      <input className="input-field" placeholder="0.00" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#2e5070",marginBottom:6,letterSpacing:".08em"}}>Payment Interval</div>
                      <select className="select-field" value={form.interval} onChange={e=>setForm(f=>({...f,interval:e.target.value}))}>
                        {INTERVALS.map(v=><option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:"#1e3a50",borderTop:"1px solid #0e1b28",paddingTop:12,lineHeight:1.7}}>
                    <span style={{color:"#2e5070"}}>How it works: </span>
                    your wallet signs off-chain → contract verifies on Arc Testnet → USDC transferred trustlessly
                  </div>
                  <button className="submit-btn" onClick={handlePayment} >
                    {txState==="signing"?<><span className="spinning">◌</span> Signing…</>:txState==="pending"?<><span className="spinning">◌</span> Broadcasting…</>:"Sign & Send Payment →"}
                  </button>
                </div>
              )}
            </div>
            <div style={{marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[{label:"PaymentScheduler",addr:SCHEDULER_ADDRESS},{label:"USDC (Arc Testnet)",addr:USDC_ADDRESS}].map(c=>(
                <div key={c.addr} style={{padding:"10px 14px",border:"1px solid #0e1b28",borderRadius:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,color:"#2e5070"}}>{c.label}</span>
                  <a href={`https://testnet.arcscan.app/address/${c.addr}`} target="_blank" rel="noreferrer" style={{fontSize:10,color:"#3dd6f5",fontFamily:"monospace",textDecoration:"none"}}>{c.addr.slice(0,10)}…</a>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==="schedule" && (
          <div className="animate-in">
            <div className="card">
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>Recurring Schedule</div>
              <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 90px 90px 70px",gap:10,padding:"6px 14px",fontSize:10,color:"#2e5070",letterSpacing:".08em",marginBottom:4}}>
                <span>Address</span><span>Label</span><span>Amount</span><span>Interval</span><span>Next</span>
              </div>
              {scheduled.map((row:ScheduledRow) => (
                <div key={row.id} className="row-item" style={{gridTemplateColumns:"1.4fr 1fr 90px 90px 70px"}}>
                  <span style={{color:"#3dd6f5",fontSize:11}}>{row.to}</span>
                  <span style={{color:"#8ab4cc"}}>{row.label}</span>
                  <span style={{fontVariantNumeric:"tabular-nums"}}>{row.amount}</span>
                  <span style={{color:"#a78bfa",fontSize:11}}>{row.interval}</span>
                  <span style={{color:"#ffd166",fontSize:11}}>{row.next}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{marginTop:16}}>
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>Add Recipient</div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <div style={{fontSize:10,color:"#2e5070",marginBottom:6}}>Wallet Address</div>
                    <input className="input-field" placeholder="0x..." value={schedForm.to} onChange={e=>setSchedForm(f=>({...f,to:e.target.value}))}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#2e5070",marginBottom:6}}>Label (optional)</div>
                    <input className="input-field" placeholder="e.g. John D." value={schedForm.label} onChange={e=>setSchedForm(f=>({...f,label:e.target.value}))}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <div style={{fontSize:10,color:"#2e5070",marginBottom:6}}>Amount (USDC)</div>
                    <input className="input-field" placeholder="0.00" type="number" value={schedForm.amount} onChange={e=>setSchedForm(f=>({...f,amount:e.target.value}))}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#2e5070",marginBottom:6}}>Interval</div>
                    <select className="select-field" value={schedForm.interval} onChange={e=>setSchedForm(f=>({...f,interval:e.target.value}))}>
                      {INTERVALS.map(v=><option key={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <button className="submit-btn" onClick={handleAddSchedule} disabled={!schedForm.to||!schedForm.amount}>Add to Schedule →</button>
              </div>
            </div>
          </div>
        )}

        {activeTab==="history" && (
          <div className="animate-in">
            <div className="card">
              <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:18}}>Transaction History</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 90px 90px 90px",gap:10,padding:"6px 14px",fontSize:10,color:"#2e5070",letterSpacing:".08em",marginBottom:4}}>
                <span>Recipient</span><span>Timestamp</span><span>Amount</span><span>Interval</span><span>Status</span>
              </div>
              {MOCK_HISTORY.map((row:HistoryRow) => (
                <div key={row.id} className="row-item" style={{gridTemplateColumns:"1fr 1fr 90px 90px 90px"}}>
                  <span style={{color:"#3dd6f5",fontSize:11}}>{row.to}</span>
                  <span style={{color:"#4a7090",fontSize:11}}>{row.ts}</span>
                  <span style={{fontVariantNumeric:"tabular-nums"}}>{row.amount}</span>
                  <span style={{color:"#a78bfa",fontSize:11}}>{row.interval}</span>
                  <StatusPill status={row.status}/>
                </div>
              ))}
            </div>
            <div style={{marginTop:16,padding:"12px 16px",border:"1px solid #0f2235",borderRadius:5,display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:14}}>🔐</span>
              <span style={{fontSize:11,color:"#2e5070",lineHeight:1.7}}>
                All transactions recorded on <span style={{color:"#3dd6f5"}}>Arc Testnet</span> — verifiable at{" "}
                <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" style={{color:"#8ab4cc",textDecoration:"none"}}>testnet.arcscan.app</a>.
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ArcPayroll() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ArcPayrollInner/>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
