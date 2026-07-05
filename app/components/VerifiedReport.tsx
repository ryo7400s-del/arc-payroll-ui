"use client";
import { useState } from "react";

type SwapInfo = {
  usdcIn: string;
  eurcOut: string;
  rate: number;
} | null;

type VerifiedItem = {
  owner: string;
  recipient: string;
  amount: string;
  txHash: string;
  scheduler: string;
  label: string;
  timestamp: number;
  blockNumber: string;
  verified: true;
  swapInfo?: SwapInfo;
};

type FailedItem = {
  owner: string;
  recipient: string;
  amount: string;
  txHash: string;
  reason: string;
};

export default function VerifiedReport({ address }: { address: string }) {
  const [verified, setVerified] = useState<VerifiedItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const fetchReport = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/verified-report?owner=${address}`);
      const data = await res.json();
      setVerified(data.verified || []);
      setFailed(data.failed || []);
      setChecked(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const downloadCSV = () => {
    const rows = [
      ["Date", "Recipient", "Label", "Amount Sent (USDC)", "EURC Received", "Swap Rate (EURC/USDC)", "TX Hash", "Block", "ArcScan Link"],
      ...verified.map(v => [
        new Date(v.timestamp).toISOString(),
        v.recipient,
        v.label,
        (Number(v.amount) / 1e6).toFixed(2),
        v.swapInfo ? (Number(v.swapInfo.eurcOut) / 1e6).toFixed(6) : "-",
        v.swapInfo ? v.swapInfo.rate.toFixed(6) : "-",
        v.txHash,
        v.blockNumber,
        `https://testnet.arcscan.app/tx/${v.txHash}`,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-report-${address.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalAmount = verified.reduce((sum, v) => sum + Number(v.amount), 0) / 1e6;

  return (
    <div className="card">
      <div style={{ fontSize: 10, letterSpacing: ".14em", color: "#2e6080", textTransform: "uppercase", marginBottom: 18 }}>
        Verified Payroll Report
      </div>

      <div style={{ fontSize: 11, color: "#4a7090", marginBottom: 16, lineHeight: 1.7 }}>
        Every transaction is re-verified directly on-chain before appearing in this report.
        Cached data alone is never trusted — this guarantees the report cannot be tampered with.
      </div>

      <button
        className="submit-btn"
        onClick={fetchReport}
        disabled={loading || !address}
        style={{ marginBottom: 16 }}
      >
        {loading ? <><span className="spinning">◌</span> Verifying on-chain...</> : "Generate Verified Report →"}
      </button>

      {checked && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ padding: "10px 14px", background: "#070e18", border: "1px solid #1a2a3a", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#8ab4cc" }}>Verified</div>
              <div style={{ fontSize: 18, color: "#00e5a0" }}>{verified.length}</div>
            </div>
            <div style={{ padding: "10px 14px", background: "#070e18", border: "1px solid #1a2a3a", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#8ab4cc" }}>Total Paid</div>
              <div style={{ fontSize: 18, color: "#3dd6f5" }}>${totalAmount.toFixed(2)}</div>
            </div>
            <div style={{ padding: "10px 14px", background: "#070e18", border: failed.length > 0 ? "1px solid #ff4d6d" : "1px solid #1a2a3a", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#8ab4cc" }}>Flagged</div>
              <div style={{ fontSize: 18, color: failed.length > 0 ? "#ff4d6d" : "#4a6070" }}>{failed.length}</div>
            </div>
          </div>

          {verified.length > 0 && (
            <button
              onClick={downloadCSV}
              style={{ background: "#3dd6f522", border: "1px solid #3dd6f5", borderRadius: 6, color: "#3dd6f5", fontSize: 11, padding: "8px 16px", cursor: "pointer", marginBottom: 16 }}
            >
              ↓ Download CSV
            </button>
          )}

          {failed.length > 0 && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#1a0a0a", border: "1px solid #ff4d6d44", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#ff4d6d", marginBottom: 6 }}>⚠ {failed.length} entries could not be verified on-chain</div>
              {failed.map((f, i) => (
                <div key={i} style={{ fontSize: 9, color: "#ff4d6d", marginBottom: 2 }}>{f.txHash.slice(0, 12)}... — {f.reason}</div>
              ))}
            </div>
          )}

          {verified.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {verified.map((v, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #0e1b28" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "#8ab4cc" }}>{v.label}</span>
                    <span style={{ color: "#3dd6f5" }}>{(Number(v.amount) / 1e6).toFixed(2)} USDC</span>
                    <a href={`https://testnet.arcscan.app/tx/${v.txHash}`} target="_blank" rel="noreferrer" style={{ color: "#00e5a0", fontSize: 9 }}>
                      Verify ↗
                    </a>
                  </div>
                  {v.swapInfo && (
                    <div style={{ fontSize: 9, color: "#a78bfa", marginTop: 3 }}>
                      → {(Number(v.swapInfo.eurcOut) / 1e6).toFixed(6)} EURC @ rate {v.swapInfo.rate.toFixed(6)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {verified.length === 0 && failed.length === 0 && (
            <div style={{ textAlign: "center", color: "#4a6070", fontSize: 12, padding: "20px 0" }}>No execution history found.</div>
          )}
        </>
      )}
    </div>
  );
}
