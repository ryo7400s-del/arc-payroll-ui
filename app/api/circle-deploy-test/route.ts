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

    // 💡 修正ポイント1: ethers.Transaction.from を使ってオブジェクトを生成する
    // ethers v6 の仕様に合わせ、数値系は BigInt (末尾にn) を使用して安定させます
    const tx = ethers.Transaction.from({
      nonce: nonce,
      data: bytecode,
      value: 0n,
      gasLimit: BigInt(gasLimit),
      maxFeePerGas: feeData.maxFeePerGas ?? 1000000000n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 1000000000n,
      chainId: 5042002, // Arc TestnetのチェーンID
      type: 2,
    });

    // 💡 修正ポイント2: 未署名のRawトランザクション(0xから始まる16進数文字列)を取得
    const rawTx = tx.unsignedSerialized;
    console.log("[circle-test] rawTx:", rawTx);

    // 💡 修正ポイント3: 'transaction' ではなく 'rawTransaction' を送る
    // blockchain パラメータは含めない
    const requestBody = {
      idempotencyKey: crypto.randomUUID(),
      walletId: walletId,
      rawTransaction: rawTx, 
    };

    const response = await fetch("https://api.circle.com/v1/w3s/user/sign/transaction", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
        "X-User-Token": userToken,
      },
      body: JSON.stringify(requestBody), // ここで1回だけ文字列化する
    });

    const data = await response.json();
    console.log("[circle-test] response:", JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json({ 
        error: data.message || "Unknown error", 
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
