import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, keccak256, encodePacked, toBytes } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name:"USDC", symbol:"USDC", decimals:18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const SCHEDULER = "0x5692fd41eb6289980c2a051f0c0fafa2b889743f" as `0x${string}`;

const PAYMENT_AMOUNT = "1000000"; // 1 USDC (6 decimals)
const PAYMENT_RECEIVER = "0x2032C2aC5cdB02b2e0D46e015Af991C257edd388" as `0x${string}`;

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

const USDC_ABI = [
  { type:"function", name:"balanceOf",
    inputs:[{name:"account",type:"address"}],
    outputs:[{type:"uint256"}] },
];
const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const payer    = searchParams.get("payer");
  const txHash   = searchParams.get("tx");

  // 支払いなし → 402返す
  if (!payer || !txHash) {
    return NextResponse.json({
      error: "Payment Required",
      x402: {
        amount: PAYMENT_AMOUNT,
        token: USDC,
        receiver: PAYMENT_RECEIVER,
        chain: arcTestnet.id,
        description: "Pay 1 USDC to view this month's payroll report",
      }
    }, {
      status: 402,
      headers: { "x-payment-required": "true" }
    });
  }

  // TX検証
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`
    });

    if (!receipt || receipt.status !== "success") {
      return NextResponse.json({ error: "Invalid transaction" }, { status: 402 });
    }

    // 支払い確認OK → レポートを返す
    return NextResponse.json({
      success: true,
      report: {
        month: "June 2026",
        totalDisbursed: "16,050.00",
        employees: [
          { label:"Alice M.",  amount:"4,200.00", status:"sent", tx:"0xabc1..." },
          { label:"Bob R.",    amount:"3,800.00", status:"sent", tx:"0xabc2..." },
          { label:"Carol T.",  amount:"2,950.00", status:"sent", tx:"0xabc3..." },
          { label:"Dave K.",   amount:"5,100.00", status:"sent", tx:"0xabc4..." },
        ],
        generatedAt: new Date().toISOString(),
        verifiedBy: "Arc Testnet · PaymentScheduler",
      }
    });
  } catch(e) {
    return NextResponse.json({ error: "Verification failed" }, { status: 402 });
  }
}
