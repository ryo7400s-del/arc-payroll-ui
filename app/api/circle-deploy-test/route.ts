import { NextRequest, NextResponse } from "next/server";

const BYTECODE = ""; // 後でDeployContract.tsxから取得

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, walletAddress, bytecode } = await req.json();

    if (!userToken || !walletId || !walletAddress) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    console.log("[circle-test] trying contractDeployment...");
    console.log("[circle-test] walletId:", walletId);
    console.log("[circle-test] walletAddress:", walletAddress);

    const response = await fetch("https://api.circle.com/v1/w3s/user/transactions/contractDeployment", {
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
        bytecode: bytecode,
        fee: {
          type: "level",
          architecture: "fee-market",
          level: "MEDIUM"
        }
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
