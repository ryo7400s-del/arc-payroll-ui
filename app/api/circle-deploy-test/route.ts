import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const RPC_URL = "https://rpc.testnet.arc.network";

export async function POST(req: NextRequest) {
  try {
    // 💡 修正: 宛先コントラクトアドレスがフロントから渡されることを想定（デプロイなら空またはコントラクトアドレス）
    const { userToken, walletId, walletAddress, bytecode, to } = await req.json();

    if (!userToken || !walletId || !walletAddress || !bytecode) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const feeData = await provider.getFeeData();

    // 💡 修正ポイント: rawTransaction ではなく transaction オブジェクトで構成する
    // Circleに「何をしたいか」をJSONとして渡すため、UIの解読精度が上がります
    const requestBody = {
      idempotencyKey: crypto.randomUUID(),
      walletId: walletId,
      transaction: {
        to: to || null, // デプロイの場合はnull、呼び出しならコントラクトアドレス
        value: "0",
        data: bytecode,
        fee: {
            // EIP-1559 形式の指定
            maxFeePerGas: feeData.maxFeePerGas?.toString() ?? "1000000000",
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() ?? "1000000000"
        }
      },
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
      console.error("[circle-test] API Error Detail:", JSON.stringify(data));
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
