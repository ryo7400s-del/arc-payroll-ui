import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

const RPC_URL = "https://rpc.testnet.arc.network";

export async function POST(req: NextRequest) {
  try {
    const { userToken, walletId, walletAddress, bytecode } = await req.json();

    if (!userToken || !walletId || !walletAddress || !bytecode) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const client = initiateUserControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
    });

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const [nonce, feeData] = await Promise.all([
      provider.getTransactionCount(walletAddress),
      provider.getFeeData(),
    ]);

    // type 0 でも type 2 でも試せるよう両方用意
    const tx = ethers.Transaction.from({
      type: 2,
      chainId: 5042002,
      nonce,
      maxFeePerGas: feeData.maxFeePerGas ?? ethers.parseUnits("2", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("1", "gwei"),
      gasLimit: 3_000_000n,
      data: bytecode,
      value: 0n,
    });

    console.log("[circle-test] wallet:", walletAddress);
    console.log("[circle-test] nonce:", nonce);
    console.log("[circle-test] chainId:", 5042002);
    console.log("[circle-test] unsignedSerialized length:", tx.unsignedSerialized.length);

    const { data: challengeData } = await client.signTransaction({
      userToken,
      walletId,
      rawTransaction: tx.unsignedSerialized,
    });

    return NextResponse.json({
      challengeId: challengeData!.challengeId,
    });
  } catch (e: any) {
    console.error("[circle-test] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
