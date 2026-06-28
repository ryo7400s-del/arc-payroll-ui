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

    // 💡 修正ポイント1: chainIdを10進数の数値(5042002)に変更し、型(type: 2)を明記
    const txObject = {
      nonce: "0x" + nonce.toString(16),
      data: bytecode,
      value: "0x0",
      gasLimit: "0x" + gasLimit.toString(16),
      maxFeePerGas: "0x" + BigInt(feeData.maxFeePerGas ?? 1000000000n).toString(16),
      maxPriorityFeePerGas: "0x" + BigInt(feeData.maxPriorityFeePerGas ?? 1000000000n).toString(16),
      chainId: 5042002, 
      type: 2,
    };

    console.log("[circle-test] txObject:", txObject);

    // 💡 修正ポイント2: Circle APIの仕様に従い、blockchainを削除
    const requestBody = {
      idempotencyKey: crypto.randomUUID(),
      walletId: walletId,
      transaction: JSON.stringify(txObject),
    };

    // 💡 修正ポイント3: JSON.stringifyをここで1回だけ実行し、JSON崩れを防止
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
    console.log("[circle-test] response:", JSON.stringify(data));

    if (!response.ok) {
      // エラー時のログを見やすく調整
      return NextResponse.json({ 
        error: data.message, 
        details: data.errors || data 
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
