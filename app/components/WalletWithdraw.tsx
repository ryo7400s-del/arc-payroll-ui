"use client";
import { useState, useEffect, useCallback } from "react";
import { createWalletClient, custom, parseUnits, formatUnits } from "viem";

const arcTestnet = {
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const USDC_ABI = [
  { type: "function", name: "balanceOf", inputs: [{name:"account",type:"address"}], outputs: [{type:"uint256"}] },
  { type: "function", name: "transfer", inputs: [{name:"to",type:"address"},{name:"amount",type:"uint256"}], outputs: [{type:"bool"}] },
] as const;

export default function WalletWithdraw({
  address,
  publicClient,
  getPrivyProvider,
  isPrivyConnected,
  privyWallets,
  isCircleConnected,
  circleUserToken,
  circleWalletId,
  circleEncryptionKey,
}: {
  address: string;
  publicClient: any;
  getPrivyProvider?: () => Promise<any>;
  isPrivyConnected?: boolean;
  privyWallets?: any[];
  isCircleConnected?: boolean;
  circleUserToken?: string;
  circleWalletId?: string;
  circleEncryptionKey?: string;
}) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      const bal = await publicClient.readContract({
        address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [address as `0x${string}`],
      }) as bigint;
      setBalance(bal);
    } catch (e) { console.error(e); }
  }, [address, publicClient]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const balanceFormatted = Number(formatUnits(balance, 6));

  const setPercent = (pct: number) => {
    const val = (balanceFormatted * pct / 100);
    setAmount(val.toFixed(2));
  };

  const handleSend = async () => {
    if (!toAddress || !amount || !address) { alert("送金先アドレスと金額を入力してください"); return; }
    if (!toAddress.startsWith("0x")) { alert("有効なアドレスを入力してください"); return; }
    const amountWei = parseUnits(amount, 6);
    if (amountWei > balance) { alert("残高が不足しています"); return; }

    try {
      setStatus("送金中...");

      // Circle ウォレット専用フロー
      if (isCircleConnected && circleUserToken && circleWalletId && circleEncryptionKey) {
        const res = await fetch("/api/circle-transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userToken: circleUserToken,
            walletId: circleWalletId,
            toAddress,
            amount,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        const sdk = new W3SSdk();
        sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
        sdk.setAuthentication({ userToken: circleUserToken, encryptionKey: circleEncryptionKey });
        await new Promise<void>((resolve, reject) => {
          sdk.execute(data.challengeId, (err: any) => {
            if (err) reject(new Error(err.message));
            else resolve();
          });
        });
        setStatus("✅ 送金完了！");
        setAmount(""); setToAddress("");
        await fetchBalance();
        return;
      }

      // Privy / MetaMask フロー
      let eip1193: any;
      if (isPrivyConnected && privyWallets) {
        const embWallet = privyWallets.find((w: any) => w.walletClientType === "privy");
        if (!embWallet) throw new Error("Privy wallet not found");
        await embWallet.switchChain(5042002);
        eip1193 = await embWallet.getEthereumProvider();
      } else {
        if (!(window as any).ethereum) throw new Error("MetaMask not found");
        eip1193 = (window as any).ethereum;
      }

      const wc = createWalletClient({ account: address as `0x${string}`, chain: arcTestnet, transport: custom(eip1193) });
      const hash = await wc.writeContract({
        address: USDC, abi: USDC_ABI, functionName: "transfer",
        args: [toAddress as `0x${string}`, amountWei],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("✅ 送金完了！");
      setAmount(""); setToAddress("");
      await fetchBalance();
    } catch (e: any) {
      setStatus("❌ " + e.message);
    }
  };

  return (
    <div className="card">
      <div style={{ fontSize: 10, letterSpacing: ".14em", color: "#2e6080", textTransform: "uppercase", marginBottom: 18 }}>Withdraw USDC</div>

      <div style={{ marginBottom: 16, padding: "12px 16px", background: "#070e18", border: "1px solid #1a2a3a", borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: "#8ab4cc", marginBottom: 4 }}>残高</div>
        <div style={{ fontSize: 24, color: "#3dd6f5", fontWeight: 600 }}>{balanceFormatted.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span style={{ fontSize: 14, color: "#8ab4cc" }}>USDC</span></div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#8ab4cc", marginBottom: 6 }}>送金先アドレス</div>
        <input className="input-field" placeholder="0x..." value={toAddress} onChange={e => setToAddress(e.target.value)} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "#8ab4cc", marginBottom: 6 }}>金額 (USDC)</div>
        <input className="input-field" placeholder="0.00" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[25, 50, 100].map(pct => (
          <button
            key={pct}
            onClick={() => setPercent(pct)}
            style={{ flex: 1, padding: "6px 0", borderRadius: 4, fontSize: 11, cursor: "pointer", background: "#0c1520", border: "1px solid #1a2a3a", color: "#8ab4cc" }}
          >
            {pct}%
          </button>
        ))}
      </div>

      <button
        className="submit-btn"
        onClick={handleSend}
        disabled={!toAddress || !amount}
      >
        Send →
      </button>

      {status && <div style={{ fontSize: 10, color: status.startsWith("❌") ? "#ff4d6d" : "#00e5a0", marginTop: 10 }}>{status}</div>}
    </div>
  );
}
