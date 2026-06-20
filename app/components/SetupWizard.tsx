"use client";
import { useState } from "react";

type Step = "deploy" | "whitelist" | "schedule" | "complete";

type Props = {
  address: string;
  hasDeployed: boolean;
  hasWhitelist: boolean;
  hasSchedules: boolean;
  onDeploy: () => void;
  onWhitelist: () => void;
  onSchedule: () => void;
};

export default function SetupWizard({ address, hasDeployed, hasWhitelist, hasSchedules, onDeploy, onWhitelist, onSchedule }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const currentStep: Step = !hasDeployed ? "deploy" : !hasWhitelist ? "whitelist" : !hasSchedules ? "schedule" : "complete";

  if (dismissed || currentStep === "complete") return null;

  const steps = [
    { id: "deploy",    num: 1, label: "Deploy Contract",   desc: "Create your dedicated smart contract" },
    { id: "whitelist", num: 2, label: "Add to Whitelist",  desc: "Register employee wallet addresses" },
    { id: "schedule",  num: 3, label: "Add First Employee", desc: "Set up payroll schedule" },
    { id: "complete",  num: 4, label: "Auto Payroll",       desc: "Automatic payments activated" },
  ];

  return (
    <div style={{background:"#070e18",border:"1px solid #1a3a5a",borderRadius:8,padding:"16px",marginBottom:16,position:"relative"}}>
      <button onClick={()=>setDismissed(true)} style={{position:"absolute",top:10,right:12,background:"none",border:"none",color:"#4a6070",cursor:"pointer",fontSize:16}}>×</button>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#3dd6f5",textTransform:"uppercase",marginBottom:14}}>
        🚀 Getting Started
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {steps.map((step) => {
          const isDone =
            (step.id==="deploy" && hasDeployed) ||
            (step.id==="whitelist" && hasWhitelist) ||
            (step.id==="schedule" && hasSchedules);
          const isActive = step.id === currentStep;
          return (
            <div key={step.id} style={{display:"flex",alignItems:"center",gap:12,opacity:isDone||isActive?1:0.4}}>
              <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12,fontWeight:700,background:isDone?"#00e5a0":isActive?"#3dd6f5":"#1a2a3a",color:isDone||isActive?"#070e18":"#4a6070"}}>
                {isDone ? "✓" : step.num}
              </div>
              <div>
                <div style={{fontSize:12,color:isDone?"#00e5a0":isActive?"#3dd6f5":"#8ab4cc",fontWeight:600}}>{step.label}</div>
                <div style={{fontSize:10,color:"#4a6070"}}>{step.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      {currentStep === "deploy" && (
        <button className="submit-btn" onClick={onDeploy}>🚀 Step 1: Deploy My Payroll Contract →</button>
      )}
      {currentStep === "whitelist" && (
        <button className="submit-btn" onClick={onWhitelist}>📋 Step 2: Add to Whitelist →</button>
      )}
      {currentStep === "schedule" && (
        <button className="submit-btn" onClick={onSchedule}>👤 Step 3: Add First Employee →</button>
      )}
    </div>
  );
}
