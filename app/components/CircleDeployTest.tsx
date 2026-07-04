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
      alert("Circle Wallet not connected");
      return;
    }
    try {
      // STEP1: Backend deploys contract from disposable address
      setStatus("Deploying contract...");
      const deployRes = await fetch("/api/circle-backend-deploy", { method: "POST" });
      const deployData = await deployRes.json();
      if (deployData.error) throw new Error(deployData.error);

      const contractAddress = deployData.contractAddress;
      setStatus(`Deploy complete: ${contractAddress.slice(0,10)}... RegistryRegistering...`);

      // STEP2: Circle  wallet register()  call
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

      // STEP3: Circle SDK   PIN Approve
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk();
      sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
      sdk.setAuthentication({ userToken, encryptionKey });

      setStatus("PIN required...");
      sdk.execute(data.challengeId, (err: any) => {
        if (err) {
          setStatus("❌ " + err.message);
          return;
        }
        setStatus("✅ Deploy＆registration complete！");
        setResult(contractAddress);
        onDeployed?.(contractAddress);
      });
    } catch (e: any) {
      setStatus("❌ " + e.message);
    }
  };

  const [wlAddress, setWlAddress] = useState("");
  const [approveStatus, setApproveStatus] = useState("");

  const handleApprove = async () => {
    if (!wallet || !userToken || !encryptionKey) {
      alert("Circle Wallet not connected");
      return;
    }
    const scheduler = result || prompt("Enter scheduler address:");
    if (!scheduler) return;
    try {
      setApproveStatus("Approve...");
      const res = await fetch("/api/circle-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, walletId: wallet.id, schedulerAddress: scheduler }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk();
      sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err: any) => {
        if (err) { setApproveStatus("❌ " + err.message); return; }
        setApproveStatus("✅ USDC Approvecomplete!");
      });
    } catch (e: any) {
      setApproveStatus("❌ " + e.message);
    }
  };
  const [wlStatus, setWlStatus] = useState("");

  const handleWhitelist = async () => {
    if (!wallet || !userToken || !encryptionKey) {
      alert("Circle Wallet not connected");
      return;
    }
    if (!wlAddress) { alert("Please enter an address"); return; }
    try {
      setWlStatus("Registering...");
      const res = await fetch("/api/circle-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken,
          walletId: wallet.id,
          schedulerAddress: result || "",
          targetAddress: wlAddress,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk();
      sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
      sdk.setAuthentication({ userToken, encryptionKey });

      sdk.execute(data.challengeId, (err: any) => {
        if (err) { setWlStatus("❌ " + err.message); return; }
        setWlStatus("✅ Whitelist registration complete！");
      });
    } catch (e: any) {
      setWlStatus("❌ " + e.message);
    }
  };

  if (!isConnected) return null;

  return (
    <div style={{ padding: 16, background: "#070e18", border: "1px solid #a78bfa", borderRadius: 8, marginTop: 16 }}>
      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 8 }}>🌐 Circle Wallet</div>
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
      <div style={{ marginTop: 12, borderTop: "1px solid #1a2a3a", paddingTop: 12 }}>
        <div style={{ fontSize: 10, color: "#3dd6f5", marginBottom: 6 }}>USDC Approve</div>
        <button onClick={handleApprove} style={{ background: "#3dd6f522", border: "1px solid #3dd6f5", borderRadius: 6, color: "#3dd6f5", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>
          Approve USDC (Circle)
        </button>
        {approveStatus && <div style={{ fontSize: 10, color: "#3dd6f5", marginTop: 6 }}>{approveStatus}</div>}
      </div>
      {result && (
        <div style={{ marginTop: 12, borderTop: "1px solid #1a2a3a", paddingTop: 12 }}>
          <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 6 }}>Whitelist Registration</div>
          <input className="input-field" placeholder="0x..." value={wlAddress} onChange={e => setWlAddress(e.target.value)} style={{ marginBottom: 6 }} />
          <button onClick={handleWhitelist} style={{ background: "#a78bfa22", border: "1px solid #a78bfa", borderRadius: 6, color: "#a78bfa", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>
            Add to Whitelist (Circle)
          </button>
          {wlStatus && <div style={{ fontSize: 10, color: "#3dd6f5", marginTop: 6 }}>{wlStatus}</div>}
        </div>
      )}
    </div>
  );
}
