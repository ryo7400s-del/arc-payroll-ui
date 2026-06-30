import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const RPC_URL = "https://rpc.testnet.arc.network";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ステップ1: 署名リクエストを作成してchallengeIdを返す
    if (action === "createSignRequest") {
      const { userToken, walletId, walletAddress, bytecode } = body;
      if (!userToken || !walletId || !walletAddress || !bytecode) {
        return NextResponse.json({ error: "missing params" }, { status: 400 });
      }

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const [nonce, feeData] = await Promise.all([
        provider.getTransactionCount(walletAddress),
        provider.getFeeData(),
      ]);

      let gasLimit = 4000000n;
      try {
        const estimated = await provider.estimateGas({ from: walletAddress, data: bytecode });
        gasLimit = estimated + 150000n;
      } catch {
        console.warn("[deploy] gas estimation failed, using default");
      }

      const txObject = {
        nonce,
        data: bytecode,
        value: "0",
        gas: gasLimit.toString(),
        maxFeePerGas: (feeData.maxFeePerGas ?? 1000000000n).toString(),
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1000000000n).toString(),
        chainId: 5042002,
      };

      const signRes = await fetch("https://api.circle.com/v1/w3s/user/sign/transaction", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          "Content-Type": "application/json",
          "X-User-Token": userToken,
        },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId,
          transaction: JSON.stringify(txObject),
        }),
      });

      const signData = await signRes.json();
      console.log("[deploy] sign response:", JSON.stringify(signData));

      if (!signRes.ok) {
        return NextResponse.json({ error: signData.message, details: signData }, { status: signRes.status });
      }

      // ✅ nonceをクライアントに保持させ、後でコントラクトアドレス計算に使う
      return NextResponse.json({
        challengeId: signData.data?.challengeId,
        nonce,
        walletAddress,
      });
    }

    // ステップ2: SDK実行後に得たsignedTransactionをブロードキャスト
    if (action === "broadcast") {
      const { signedTransaction, nonce, walletAddress } = body;
      if (!signedTransaction) {
        return NextResponse.json({ error: "signedTransaction is required" }, { status: 400 });
      }

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const broadcastRes = await provider.broadcastTransaction(signedTransaction);
      console.log("[deploy] broadcast txHash:", broadcastRes.hash);

      const contractAddress = ethers.getCreateAddress({ from: walletAddress, nonce });

      return NextResponse.json({ txHash: broadcastRes.hash, contractAddress });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("[deploy] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
