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

    let gasLimit = 4000000;
    try {
      const estimated = await provider.estimateGas({
        from: walletAddress,
        data: bytecode,
      });
      gasLimit = Number(estimated) + 150000;
    } catch (gasError) {
      console.warn("[circle-test] Gas estimation failed, using default.", gasError);
    }

    const tx = ethers.Transaction.from({
      nonce: nonce,
      data: bytecode,
      value: 0n,
      gasLimit: BigInt(gasLimit),
      maxFeePerGas: feeData.maxFeePerGas ?? 1000000000n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 1000000000n,
      chainId: 5042002, 
      type: 2,
    });

    const rawTx = tx.unsignedSerialized;

    // 💡 重要: rawTransactionを使う際は、blockchainを明記してチェーンを教える
    // これによりUI側が「これはArc用だ」と認識し、エラーを回避します
    const requestBody = {
      idempotencyKey: crypto.randomUUID(),
      walletId: walletId,
      blockchain: "ARC-TESTNET", // ここで明示する
      rawTransaction: rawTx, 
    };

    const response = await fetch("https://api.circle.com/v1/w3s/user/sign/transaction", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
        "X-User-Token": userToken,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[circle-test] API Error:", JSON.stringify(data));
      return NextResponse.json({ 
        error: data.message || "Failed to sign transaction", 
        details: data.errors 
      }, { status: response.status });
    }

    return NextResponse.json({
      challengeId: data.data.challengeId,
      txId: data.data.id,
    });
  } catch (e: any) {
    console.error("[circle-test] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
