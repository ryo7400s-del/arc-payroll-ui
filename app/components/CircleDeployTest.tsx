"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { useCircleWallet } from "@/lib/circle/CircleWalletContext";

const REGISTRY = "0xc01c0113e353c6fc1be7d32a80e9688e1256b81f";

export default function CircleDeployTest({ onDeployed }: { onDeployed?: (addr: string) => void }) {
  const { wallet, userToken, encryptionKey, isConnected } = useCircleWallet();
  const [status, setStatus] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [result, setResult] = useState("");

  const handleDeploy = async () => {
    if (!wallet || !userToken || !encryptionKey) {
      alert("Circle ウォレットが接続されていません");
      return;
    }
    try {
      // STEP1: バックエンドが捨てアドレスでコントラクトをデプロイ
      setStatus("コントラクトをデプロイ中...");
      const deployRes = await fetch("/api/circle-backend-deploy", { method: "POST" });
      const deployData = await deployRes.json();
      if (deployData.error) throw new Error(deployData.error);

      const contractAddress = deployData.contractAddress;
      setStatus(`デプロイ完了: ${contractAddress.slice(0,10)}... Registry登録中...`);

      // STEP2: Circle ウォレットで register() を呼ぶ
      const res = await fetch("/api/circle-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken,
          walletId: wallet.id,
          contractAddress,
          companyName: companyName || "My Company",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // STEP3: Circle SDK で PIN 承認
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk();
      sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
      sdk.setAuthentication({ userToken, encryptionKey });

      setStatus("PINを入力してください...");
      sdk.execute(data.challengeId, (err: any) => {
        if (err) {
          setStatus("❌ " + err.message);
          return;
        }
        setStatus("✅ デプロイ＆登録完了！");
        setResult(contractAddress);
        onDeployed?.(contractAddress);
      });
    } catch (e: any) {
      setStatus("❌ " + e.message);
    }
  };

  if (!isConnected) return null;

  return (
    <div style={{ padding: 16, background: "#070e18", border: "1px solid #a78bfa", borderRadius: 8, marginTop: 16 }}>
      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 8 }}>🔬🔬🔬 TEST MARKER 12345 🔬🔬🔬</div>
      <input
        className="input-field"
        placeholder="Company Name"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <button
        onClick={handleDeploy}
        style={{ background: "#a78bfa22", border: "1px solid #a78bfa", borderRadius: 6, color: "#a78bfa", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}
      >
        Deploy & Register (Circle)
      </button>
      {status && <div style={{ fontSize: 10, color: "#3dd6f5", marginTop: 8 }}>{status}</div>}
      {result && <div style={{ fontSize: 10, color: "#00e5a0", marginTop: 4, wordBreak: "break-all" }}>{result}</div>}
    </div>
  );
}
