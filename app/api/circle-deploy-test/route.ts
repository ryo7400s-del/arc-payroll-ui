import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const RPC_URL = "https://rpc.testnet.arc.network";

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, walletAddress, bytecode } = await req.json();

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
      const estimated = await provider.estimateGas({
        from: walletAddress,
        data: bytecode,
      });
      gasLimit = estimated + 150000n;
    } catch {
      console.warn("[deploy] gas estimation failed, using default");
    }

    // ✅ toなし = コントラクトデプロイ
    const tx = ethers.Transaction.from({
      nonce,
      to: null,
      data: bytecode,
      value: 0n,
      gasLimit,
      maxFeePerGas: feeData.maxFeePerGas ?? 1000000000n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 1000000000n,
      chainId: 5042002,
      type: 2,
    });

    const rawTx = tx.unsignedSerialized;

    // ✅ Circle には署名だけさせる
    const signRes = await fetch(
      "https://api.circle.com/v1/w3s/user/sign/transaction",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          "Content-Type": "application/json",
          "X-User-Token": userToken,
        },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId,
          transaction: rawTx,
        }),
      }
    );

    const signData = await signRes.json();
    console.log("[deploy] sign response:", JSON.stringify(signData));

    if (!signRes.ok) {
      return NextResponse.json(
        { error: signData.message || "署名失敗", details: signData },
        { status: signRes.status }
      );
    }

    const signedTx = signData.data?.signedTransaction;
    if (!signedTx) {
      return NextResponse.json(
        { error: "signedTransaction が返ってきませんでした", details: signData },
        { status: 500 }
      );
    }

    // ✅ ethers.js で直接ARC-TESTNETにブロードキャスト
    const broadcastRes = await provider.broadcastTransaction(signedTx);
    console.log("[deploy] broadcast txHash:", broadcastRes.hash);

    // デプロイ先アドレスを計算
    const contractAddress = ethers.getCreateAddress({
      from: walletAddress,
      nonce,
    });

    return NextResponse.json({
      txHash: broadcastRes.hash,
      contractAddress,
    });

  } catch (e: any) {
    console.error("[deploy] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
