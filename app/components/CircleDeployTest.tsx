"use client";
import { useState } from "react";

export default function CircleDeployTest() {
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [deployerAddress, setDeployerAddress] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setStatus("deploying...");
    setTxHash("");
    setContractAddress("");
    setDeployerAddress("");

    try {
      const res = await fetch("/api/deploy-scheduler", { method: "POST" });
      const data = await res.json();

      if (!res.ok || data.error) {
        setStatus("❌ " + (data.error || "デプロイ失敗"));
        if (data.deployerAddress) setDeployerAddress(data.deployerAddress);
        return;
      }

      setStatus("✅ デプロイ成功！");
      setTxHash(data.txHash);
      setContractAddress(data.contractAddress);
      setDeployerAddress(data.deployerAddress);
    } catch (e: any) {
      setStatus("❌ " + e.message);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div style={{ padding: 16, background: "#070e18", border: "1px solid #a78bfa", borderRadius: 8, marginTop: 16 }}>
      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 8 }}>🔬 PaymentScheduler Deploy</div>
      <button
        onClick={handleDeploy}
        disabled={isDeploying}
        style={{
          background: "#a78bfa22",
          border: "1px solid #a78bfa",
          borderRadius: 6,
          color: "#a78bfa",
          fontSize: 11,
          padding: "6px 12px",
          cursor: isDeploying ? "not-allowed" : "pointer",
          opacity: isDeploying ? 0.5 : 1,
        }}
      >
        {isDeploying ? "Deploying..." : "Deploy Contract"}
      </button>
      {status && <div style={{ fontSize: 10, color: "#3dd6f5", marginTop: 8 }}>{status}</div>}
      {deployerAddress && <div style={{ fontSize: 9, color: "#8ab4cc", marginTop: 4 }}>Deployer: {deployerAddress}</div>}
      {txHash && <div style={{ fontSize: 9, color: "#00e5a0", marginTop: 4 }}>TxHash: {txHash}</div>}
      {contractAddress && <div style={{ fontSize: 9, color: "#00e5a0", marginTop: 2 }}>Contract: {contractAddress}</div>}
    </div>
  );
}
