import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";

const USDC = "0x3600000000000000000000000000000000000000";

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, toAddress, amount } = await req.json();
    if (!userToken || !walletId || !toAddress || !amount) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const amountWei = parseUnits(amount, 6).toString();

    const response = await fetch("https://api.circle.com/v1/w3s/user/transactions/contractExecution", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId,
        contractAddress: USDC,
        abiFunctionSignature: "transfer(address,uint256)",
        abiParameters: [toAddress, amountWei],
        feeLevel: "MEDIUM",
      }),
    });

    const data = await response.json();
    console.log("[circle-transfer] response:", JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    }

    return NextResponse.json({ challengeId: data.data.challengeId });
  } catch (e: any) {
    console.error("[circle-transfer] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
