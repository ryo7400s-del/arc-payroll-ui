"use client";
import { useState } from "react";
import { createPublicClient, http } from "viem";
import { addEmployeesBatch, arcTestnet, type Employee, type StepStatus } from "../lib/employeeBatch";

type Row = { label: string; to: string; amount: string; interval: number; firstExecution?: bigint; status: "pending"|"whitelisting"|"scheduling"|"approving"|"success"|"error"; error?: string };

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
      const lines = text.trim().split("\n").slice(1);
      const parsed: Row[] = lines.map(line => {
        const [label, to, amount, intervalStr, dateStr] = line.split(",").map(s => s.trim());
        const intervalMap: Record<string,number> = {
          "weekly":604800, "bi-weekly":1209600, "monthly":2592000, "quarterly":7776000
        };
        let firstExecution: bigint | undefined;
        if (dateStr) {
          const d = dateStr.toLowerCase();
          const t = new Date(); t.setUTCHours(0,0,0,0);
          if (d === "today") firstExecution = BigInt(Math.floor(t.getTime()/1000));
          else if (d === "tomorrow") { t.setUTCDate(t.getUTCDate()+1); firstExecution = BigInt(Math.floor(t.getTime()/1000)); }
          else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) firstExecution = BigInt(Math.floor(new Date(dateStr).getTime()/1000));
        }
        return {
          label: label || "Employee",
          to: to || "",
          amount: amount || "0",
          interval: intervalMap[intervalStr?.toLowerCase()] || 2592000,
          firstExecution,
          status: "pending" as const,
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
    const pc = createPublicClient({ chain: arcTestnet, transport: http() });

    const employees: Employee[] = rows.map(r => ({
      label: r.label, to: r.to as `0x${string}`, amount: r.amount, interval: r.interval,
      firstExecution: r.firstExecution,
    }));

    await addEmployeesBatch(employees, address as `0x${string}`, scheduler, abi, pc, (index, status, error) => {
      if (index === -1) return; // approving step
      setRows(prev => prev.map((r, idx) => idx === index ? { ...r, status: status as Row["status"], error } : r));
    });

    setRunning(false);
    setDone(true);
  };

  return (
    <div className="card" style={{marginTop:16}}>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#2e6080",textTransform:"uppercase",marginBottom:12}}>
        CSV Bulk Import
      </div>
      <div style={{fontSize:11,color:"#8ab4cc",marginBottom:8}}>
        CSV format: <span style={{color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>Label, Address, Amount(USDC), Interval, FirstPaymentDate</span>
      </div>
      <div style={{fontSize:10,color:"#8ab4cc",marginBottom:12}}>
        Interval: weekly/bi-weekly/monthly/quarterly · Date: today/tomorrow/YYYY-MM-DD (optional)
      </div>
      <input type="file" accept=".csv" onChange={handleFile}
        style={{fontSize:11,color:"#8ab4cc",marginBottom:12,display:"block"}}/>
      {rows.length > 0 && (
        <>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,maxHeight:200,overflowY:"auto"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 60px 80px 70px",gap:6,padding:"4px 8px",borderBottom:"1px solid #0e1b28"}}>
              {["Name","Address","USDC","Interval","Status"].map(h=>(
                <span key={h} style={{fontSize:9,color:"#8ab4cc",textTransform:"uppercase",letterSpacing:".1em"}}>{h}</span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 60px 80px 70px",gap:6,padding:"6px 8px",background:"#070e18",borderRadius:4,border:"1px solid #0e1b28",alignItems:"center"}}>
                <span style={{fontSize:11,color:"#8ab4cc"}}>{r.label}</span>
                <span style={{fontSize:10,color:"#3dd6f5",fontFamily:"DM Mono,monospace"}}>{r.to.slice(0,8)}…</span>
                <span style={{fontSize:11,color:"#00e5a0"}}>{r.amount}</span>
                <span style={{fontSize:10,color:"#a78bfa"}}>{r.interval===604800?"Weekly":r.interval===1209600?"Bi-weekly":r.interval===2592000?"Monthly":"Quarterly"}</span>
                <span style={{fontSize:9,color:r.status==="success"?"#00e5a0":r.status==="error"?"#ff4d6d":"#8ab4cc"}}>
                  {r.status==="success"?"✓ Done":r.status==="error"?"✗ "+(r.error||"Error"):r.status==="whitelisting"?"Whitelisting…":r.status==="scheduling"?"Scheduling…":"…"}
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
