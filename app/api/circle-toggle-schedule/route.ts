import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, schedulerAddress, index } = await req.json();
    if (!userToken || !walletId || !schedulerAddress || index === undefined) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }
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
        contractAddress: schedulerAddress,
        abiFunctionSignature: "toggleSchedule(uint256)",
        abiParameters: [index.toString()],
        feeLevel: "MEDIUM",
      }),
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    return NextResponse.json({ challengeId: data.data.challengeId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
