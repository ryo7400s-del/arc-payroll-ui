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

    const txObject = {
      nonce: "0x" + nonce.toString(16),
      data: bytecode,
      value: "0x0",
      gasLimit: "0x" + gasLimit.toString(16),
      maxFeePerGas: "0x" + BigInt(feeData.maxFeePerGas ?? 1000000000n).toString(16),
      maxPriorityFeePerGas: "0x" + BigInt(feeData.maxPriorityFeePerGas ?? 1000000000n).toString(16),
      chainId: "0x4CE6E2",
    };

    console.log("[circle-test] txObject:", JSON.stringify(txObject));

    const response = await fetch("https://api.circle.com/v1/w3s/user/sign/transaction", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId,
        blockchain: "ARC-TESTNET",
        transaction: JSON.stringify(txObject),
      }),
    });

    const data = await response.json();
    console.log("[circle-test] response:", JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
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
