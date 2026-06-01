import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, keccak256, encodePacked, parseUnits } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name:"USDC", symbol:"USDC", decimals:18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const SCHEDULER = "0xdf56aaeb1046a0ae5fde00a3626bf4caf7e7db52" as `0x${string}`;
const MERCHANT  = "0x2032C2aC5cdB02b2e0D46e015Af991C257edd388" as `0x${string}`;

const ABI = [
  { type:"function", name:"isWhitelisted",
    inputs:[{name:"payer",type:"address"},{name:"merchant",type:"address"}],
    outputs:[{type:"bool"}] },
  { type:"function", name:"executeX402Payment",
    inputs:[{ name:"req", type:"tuple", components:[
      { name:"payer",     type:"address" },
      { name:"merchant",  type:"address" },
      { name:"amount",    type:"uint256" },
      { name:"expiry",    type:"uint256" },
      { name:"nonce",     type:"uint256" },
      { name:"signature", type:"bytes"   },
    ]}], outputs:[] },
] as const;

const publicClient = createPublicClient({ chain:arcTestnet, transport:http() });

export async function GET() {
  return NextResponse.json({
    error: "Payment Required",
    x402: {
      chainId: arcTestnet.id,
      amount: "1000000",
      merchant: MERCHANT,
      description: "Pay 1 USDC to access this content",
    }
  }, { status: 402 });
}

export async function POST(req: NextRequest) {
  try {
    const { payer, amount, expiry, nonce, signature, content } = await req.json();
    if (!payer||!amount||!expiry||!nonce||!signature) {
      return NextResponse.json({ error:"Missing fields" }, { status:400 });
    }

    const innerHash = keccak256(
      encodePacked(
        ["address","address","uint256","uint256","uint256"],
        [payer as `0x${string}`, MERCHANT, BigInt(amount), BigInt(expiry), BigInt(nonce)]
      )
    );

    const isWhitelisted = await publicClient.readContract({
      address:SCHEDULER, abi:ABI,
      functionName:"isWhitelisted",
      args:[payer as `0x${string}`, MERCHANT],
    });

    if (!isWhitelisted) {
      return NextResponse.json({ error:"Payer not whitelisted for this merchant" }, { status:402 });
    }

    const contents: Record<string,object> = {
      "payroll-report": {
        month:"June 2026", totalDisbursed:"16,050.00",
        employees:[
          { label:"Alice M.",  amount:"4,200.00" },
          { label:"Bob R.",    amount:"3,800.00" },
          { label:"Carol T.",  amount:"2,950.00" },
          { label:"Dave K.",   amount:"5,100.00" },
        ],
      },
      "analytics": {
        totalTransactions:42, totalVolume:"128,400.00", avgPayment:"3,057.14",
      },
    };

    return NextResponse.json({
      success: true,
      payment: { payer, amount, verifiedAt: new Date().toISOString() },
      data: contents[content as string] || contents["payroll-report"],
    });
  } catch(e:any) {
    return NextResponse.json({ error:e.message }, { status:500 });
  }
}
