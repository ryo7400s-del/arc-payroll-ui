import { NextRequest, NextResponse } from "next/server";

const WHITELIST_ABI_SIG = "addToWhitelist(address)";

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, schedulerAddress, targetAddress } = await req.json();

    if (!userToken || !walletId || !schedulerAddress || !targetAddress) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

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
          abiFunctionSignature: WHITELIST_ABI_SIG,
          abiParameters: [targetAddress],
          feeLevel: "MEDIUM",
        }),
      }
    );

    const data = await response.json();
    console.log("[circle-whitelist] response:", JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    }

    return NextResponse.json({ challengeId: data.data.challengeId });
  } catch (e: any) {
    console.error("[circle-whitelist] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
