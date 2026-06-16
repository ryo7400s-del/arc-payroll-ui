"use client";
import { useState } from "react";

type Step = "deploy" | "employee" | "complete";

type Props = {
  address: string;
  hasDeployed: boolean;
  hasSchedules: boolean;
  onDeploy: () => void;
  onAddEmployee: () => void;
};

export default function SetupWizard({ address, hasDeployed, hasSchedules, onDeploy, onAddEmployee }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const isDeployed = hasDeployed;
  const currentStep: Step = !isDeployed ? "deploy" : !hasSchedules ? "employee" : "complete";

  if (dismissed || currentStep === "complete") return null;

  const steps = [
    { id: "deploy",    num: 1, label: "Deploy Contract",  desc: "企業専用のスマートコントラクトを作成" },
    { id: "employee",  num: 2, label: "Add Employee",     desc: "従業員の給与スケジュールを設定" },
    { id: "complete",  num: 3, label: "Auto Payroll",     desc: "自動送金が開始されます" },
  ];

  return (
    <div style={{background:"#070e18",border:"1px solid #1a3a5a",borderRadius:8,padding:"16px",marginBottom:16,position:"relative"}}>
      <button onClick={()=>setDismissed(true)} style={{position:"absolute",top:10,right:12,background:"none",border:"none",color:"#4a6070",cursor:"pointer",fontSize:16}}>×</button>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#3dd6f5",textTransform:"uppercase",marginBottom:14}}>
        🚀 Getting Started
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {steps.map((step, i) => {
          const isDone = (step.id==="deploy" && isDeployed) || (step.id==="employee" && hasSchedules);
          const isActive = step.id === currentStep;
          return (
            <div key={step.id} style={{display:"flex",alignItems:"center",gap:12,opacity:isDone||isActive?1:0.4}}>
              <div style={{
                width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                flexShrink:0,fontSize:12,fontWeight:700,
                background:isDone?"#00e5a0":isActive?"#3dd6f5":"#1a2a3a",
                color:isDone||isActive?"#070e18":"#4a6070",
              }}>
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
        <button className="submit-btn" onClick={onDeploy}>
          🚀 Step 1: Deploy My Payroll Contract →
        </button>
      )}
      {currentStep === "employee" && (
        <button className="submit-btn" onClick={onAddEmployee}>
          👤 Step 2: Add First Employee →
        </button>
      )}
    </div>
  );
}
