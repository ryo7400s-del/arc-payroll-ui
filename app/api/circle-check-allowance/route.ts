import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseUnits } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const ALLOWANCE_ABI = [
  { type: "function", name: "allowance", inputs: [{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs: [{type:"uint256"}], stateMutability: "view" },
] as const;

export async function POST(req: NextRequest) {
  try {
    const { ownerAddress, schedulerAddress, requiredAmount } = await req.json();

    const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
    const allowance = await publicClient.readContract({
      address: USDC,
      abi: ALLOWANCE_ABI,
      functionName: "allowance",
      args: [ownerAddress as `0x${string}`, schedulerAddress as `0x${string}`],
    });

    const required = parseUnits(String(Number(requiredAmount) * 12), 6);
    const needsApprove = allowance < required;

    return NextResponse.json({ allowance: allowance.toString(), needsApprove });
  } catch (e: any) {
    console.error("[circle-check-allowance] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
