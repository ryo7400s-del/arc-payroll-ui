import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, schedulerAddress, to, amount, interval, label, firstExecution, useEURC } = await req.json();

    if (!userToken || !walletId || !schedulerAddress || !to || !amount) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const amountWei = parseUnits(amount, 6).toString();
    const fe = BigInt(firstExecution || "0").toString();

    const response = await fetch(
      "https://api.circle.com/v1/w3s/user/transactions/contractExecution",
      {
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
          abiFunctionSignature: "createSchedule(address,uint256,uint256,string,uint256,bool)",
          abiParameters: [to, amountWei, interval.toString(), label, fe, useEURC ?? false],
          feeLevel: "MEDIUM",
        }),
      }
    );

    const data = await response.json();
    console.log("[circle-schedule] response:", JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    }

    return NextResponse.json({ challengeId: data.data.challengeId });
  } catch (e: any) {
    console.error("[circle-schedule] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
