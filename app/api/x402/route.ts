import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name:"USDC", symbol:"USDC", decimals:18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;
const SCHEDULER = "0xe4150530084e49aff57fa91d6d3c207be6271c27" as `0x${string}`;
const DEFAULT_MERCHANT = "0x2032C2aC5cdB02b2e0D46e015Af991C257edd388" as `0x${string}`;
const ABI = [
  { type:"function", name:"isWhitelisted",
    inputs:[{name:"payer",type:"address"},{name:"merchant",type:"address"}],
    outputs:[{type:"bool"}] },
] as const;
const publicClient = createPublicClient({ chain:arcTestnet, transport:http() });
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const amount   = searchParams.get("amount")   || "1000000";
  const merchant = searchParams.get("merchant") || DEFAULT_MERCHANT;
  return NextResponse.json({
    error: "Payment Required",
    x402: {
      chainId: arcTestnet.id,
      amount,
      merchant,
      description: `Pay ${Number(amount)/1_000_000} USDC to access this content`,
    }
  }, { status: 402 });
}
export async function POST(req: NextRequest) {
  try {
    const { payer, amount, expiry, nonce, signature, content, merchant } = await req.json();
    if (!payer||!amount||!expiry||!nonce||!signature) {
      return NextResponse.json({ error:"Missing fields" }, { status:400 });
    }
    const MERCHANT_ADDR = (merchant || DEFAULT_MERCHANT) as `0x${string}`;
    const innerHash = keccak256(encodeAbiParameters(
      parseAbiParameters("address, address, uint256, uint256, uint256"),
      [payer as `0x${string}`, MERCHANT_ADDR, BigInt(amount), BigInt(expiry), BigInt(nonce)]
    ));
    const isWhitelisted = await publicClient.readContract({
      address:SCHEDULER, abi:ABI,
      functionName:"isWhitelisted",
      args:[payer as `0x${string}`, MERCHANT_ADDR],
    });
    if (!isWhitelisted) {
      return NextResponse.json({ error:"Payer not whitelisted for this merchant" }, { status:402 });
    }
    const contents: Record<string,object> = {
      "payroll-report": {
        month:"June 2026", totalDisbursed:"16,050.00",
        employees:[
          { label:"Alice M.", amount:"4,200.00" },
          { label:"Bob R.",   amount:"3,800.00" },
          { label:"Carol T.", amount:"2,950.00" },
          { label:"Dave K.",  amount:"5,100.00" },
        ],
      },
      "analytics": {
        totalTransactions:42, totalVolume:"128,400.00", avgPayment:"3,057.14",
      },
    };
    return NextResponse.json({
      success: true,
      payment: { payer, amount, merchant: MERCHANT_ADDR, verifiedAt: new Date().toISOString() },
      data: contents[content as string] || contents["payroll-report"],
    });
  } catch(e:any) {
    return NextResponse.json({ error:e.message }, { status:500 });
  }
}
