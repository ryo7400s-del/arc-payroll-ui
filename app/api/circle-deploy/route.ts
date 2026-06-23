import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

const CIRCLE_BASE_URL = "https://api-sandbox.circle.com";

export async function POST(req: NextRequest) {
  const { userToken, companyName } = await req.json();

  try {
    const bytecode = "0x" + readFileSync(
      path.join(process.cwd(), "lib/contract.bin"), "utf8"
    ).trim();

    // Circle APIでデプロイのchallengeIdを発行
    const res = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/user/contracts/deploy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        name: companyName || "ARC PAYROLL Contract",
        blockchain: "ARC-TESTNET",
        bytecode,
        constructorParameters: [],
        feeLevel: "MEDIUM",
      }),
    });

    const data = await res.json();
    console.log("Circle deploy response:", JSON.stringify(data));

    if (!res.ok) throw new Error(data.message || "Deploy failed");

    return NextResponse.json({
      challengeId: data.data?.challengeId,
    });
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
