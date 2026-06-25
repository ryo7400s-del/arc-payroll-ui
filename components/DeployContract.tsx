"use client";
import { useState } from "react";
import { createWalletClient, createPublicClient, custom, http } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const REGISTRY = "0xc01c0113e353c6fc1be7d32a80e9688e1256b81f" as `0x${string}`;
const REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    inputs: [
      { name: "scheduler", type: "address" },
      { name: "name", type: "string" },
    ],
    outputs: [],
  },
] as const;

const BYTECODE =
  "0x6080604052348015600e575f5ffd5b50..." as `0x${string}`; // ← 元のフルバイトコードをここに貼る

// ─────────────────────────────────────────────
// Props: MetaMask と Circle で必要な情報が異なる
// ─────────────────────────────────────────────
export default function DeployContract({
  onDeployed,
  isCircleWallet = false,
  // Circle 用（親コンポーネントから渡す）
  circleUserId = "",       // Circle の userId（内部 ID）
  circleWalletId = "",     // Circle の walletId（UUID）
  circleWalletAddress = "", // オンチェーンアドレス（例: 0xabc...）
}: {
  onDeployed?: (addr: string) => void;
  isCircleWallet?: boolean;
  circleUserId?: string;
  circleWalletId?: string;
  circleWalletAddress?: string;
}) {
  const [status, setStatus] = useState<
    "idle" | "deploying" | "registering" | "pin" | "done" | "error"
  >("idle");
  const [result, setResult] = useState("");
  const [companyName, setCompanyName] = useState("");

  // ─────────────────────────────────────────────
  // MetaMask フロー（変更なし・今まで通り動く）
  // ─────────────────────────────────────────────
  const handleDeployMetaMask = async () => {
    if (!(window as any).ethereum) return alert("MetaMask required");
    setStatus("deploying");
    try {
      const [addr] = await (window as any).ethereum.request({
        method: "eth_requestAccounts",
      });
      const wc = createWalletClient({
        account: addr,
        chain: arcTestnet,
        transport: custom((window as any).ethereum),
      });
      const pc = createPublicClient({ chain: arcTestnet, transport: http() });

      const hash = await wc.deployContract({
        abi: [],
        bytecode: BYTECODE,
        account: addr as `0x${string}`,
      });
      const receipt = await pc.waitForTransactionReceipt({ hash });
      const contractAddr = receipt.contractAddress!;

      setStatus("registering");
      const rh = await wc.writeContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "register",
        args: [contractAddr, companyName || "My Company"],
        account: addr as `0x${string}`,
      });
      await pc.waitForTransactionReceipt({ hash: rh });

      setResult(contractAddr);
      setStatus("done");
      onDeployed?.(contractAddr);
    } catch (e: any) {
      setResult(e.message?.slice(0, 100));
      setStatus("error");
    }
  };

  // ─────────────────────────────────────────────
  // Circle フロー（バグ3つを修正済み）
  // ─────────────────────────────────────────────
  const handleDeployCircle = async () => {
    // バリデーション（バグ③修正: walletId が必要）
    if (!circleUserId || !circleWalletId || !circleWalletAddress) {
      return alert("Circle Wallet の情報が不足しています");
    }
    setStatus("deploying");
    try {
      // STEP 1: サーバーで signTransaction チャレンジを作成
      //         → encryptionKey も一緒に返ってくる（バグ①修正）
      const res = await fetch("/api/circle-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: circleUserId,
          walletId: circleWalletId,         // ← バグ③修正: walletId を送る
          walletAddress: circleWalletAddress,
          companyName: companyName || "My Company",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { challengeId, userToken, encryptionKey } = data;

      // STEP 2: Circle Web SDK でユーザーに PIN 入力画面を表示
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk();
      sdk.setAppSettings({ appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! });
      sdk.setAuthentication({
        userToken,
        encryptionKey, // ← バグ①修正: 空文字 "" → 正しい encryptionKey
      });

      setStatus("pin");
      sdk.execute(challengeId, async (err: any) => {
        if (err) {
          setResult(err.message?.slice(0, 100));
          setStatus("error");
          return;
        }

        // STEP 3: サーバーで署名済み TX をブロードキャストしてアドレス取得
        //         バグ②修正: result.data.contractAddress はない → サーバー経由で取得
        setStatus("registering");
        const resultRes = await fetch("/api/circle-deploy/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId, userToken, companyName }),
        });
        const resultData = await resultRes.json();
        if (resultData.error) throw new Error(resultData.error);

        setResult(resultData.contractAddress);
        setStatus("done");
        onDeployed?.(resultData.contractAddress);
      });
    } catch (e: any) {
      setResult(e.message?.slice(0, 100));
      setStatus("error");
    }
  };

  const handleDeploy = isCircleWallet
    ? handleDeployCircle
    : handleDeployMetaMask;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 10, color: "#8ab4cc", marginBottom: 6 }}>
          Company Name (optional)
        </div>
        <input
          className="input-field"
          placeholder="e.g. Arc Payroll"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>
      {isCircleWallet && (
        <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 4 }}>
          🌐 Circle Wallet でデプロイ ({circleWalletAddress.slice(0, 10)}...)
        </div>
      )}
      <button
        className="submit-btn"
        onClick={handleDeploy}
        disabled={
          status === "deploying" ||
          status === "registering" ||
          status === "done"
        }
      >
        {status === "deploying" ? (
          <>
            <span className="spinning">◌</span> Deploying…
          </>
        ) : status === "registering" ? (
          <>
            <span className="spinning">◌</span> Registering…
          </>
        ) : status === "done" ? (
          "✓ Deployed & Registered!"
        ) : status === "pin" ? (
          <>
            <span className="spinning">◌</span> PINを入力してください…
          </>
        ) : status === "error" ? (
          "❌ Failed — retry"
        ) : (
          "🚀 Deploy My Payroll Contract →"
        )}
      </button>
      {status === "done" && (
        <div
          style={{ fontSize: 10, color: "#00e5a0", wordBreak: "break-all" }}
        >
          ✅ {result}
          <br />
          <a
            href={`https://testnet.arcscan.app/address/${result}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#3dd6f5" }}
          >
            View on ArcScan ↗
          </a>
        </div>
      )}
      {status === "error" && (
        <div style={{ fontSize: 10, color: "#ff4d6d" }}>{result}</div>
      )}
    </div>
  );
}

