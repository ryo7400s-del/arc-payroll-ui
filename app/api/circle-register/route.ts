import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

const REGISTRY = "0xc01c0113e353c6fc1be7d32a80e9688e1256b81f";
const REGISTRY_ABI = ["function register(address scheduler, string name)"];

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, contractAddress, companyName } = await req.json();

    if (!userToken || !walletId || !contractAddress) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const iface = new ethers.Interface(REGISTRY_ABI);
    const callData = iface.encodeFunctionData("register", [
      contractAddress,
      companyName || "My Company",
    ]);

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
          contractAddress: REGISTRY,
          abiFunctionSignature: "register(address,string)",
          abiParameters: [contractAddress, companyName || "My Company"],
          blockchain: "ARC-TESTNET",
          feeLevel: "MEDIUM",
        }),
      }
    );

    const data = await response.json();
    console.log("[circle-register] response:", JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    }

    return NextResponse.json({ challengeId: data.data.challengeId });
  } catch (e: any) {
    console.error("[circle-register] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

