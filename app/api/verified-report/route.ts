import { kv } from "@vercel/kv";
import { createPublicClient, http, decodeEventLog } from "viem";
import { NextRequest, NextResponse } from "next/server";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://arc-testnet.drpc.org"] } },
} as const;

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

const EVENT_ABI = [{
  type: "event",
  name: "ScheduleExecuted",
  inputs: [
    { type: "address", name: "owner", indexed: true },
    { type: "address", name: "recipient", indexed: true },
    { type: "uint256", name: "amount" },
    { type: "bytes32", name: "txRef" },
  ],
}] as const;

const TRANSFER_ABI = [{
  type: "event",
  name: "Transfer",
  inputs: [
    { type: "address", name: "from", indexed: true },
    { type: "address", name: "to", indexed: true },
    { type: "uint256", name: "value", indexed: false },
  ],
}] as const;

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89b50855aa3be2f677cd6303cec089b5f319d72a";
const CURVE_POOL = "0x2d84d79c852f6842abe0304b70bbaa1506add457";

function extractSwapInfo(logs: any[]) {
  let usdcIn: bigint | null = null;
  let eurcOut: bigint | null = null;

  for (const log of logs) {
    const addr = log.address.toLowerCase();
    if (addr !== USDC && addr !== EURC) continue;
    try {
      const decoded = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
      const from = (decoded.args as any).from.toLowerCase();
      const to = (decoded.args as any).to.toLowerCase();
      const value = (decoded.args as any).value as bigint;

      if (addr === USDC && to === CURVE_POOL) usdcIn = value;
      if (addr === EURC && from === CURVE_POOL) eurcOut = value;
    } catch { /* skip non-matching logs */ }
  }

  if (usdcIn !== null && eurcOut !== null) {
    const rate = Number(eurcOut) / Number(usdcIn);
    return { usdcIn: usdcIn.toString(), eurcOut: eurcOut.toString(), rate };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const owner = req.nextUrl.searchParams.get("owner");
    if (!owner) return NextResponse.json({ error: "owner required" }, { status: 400 });

    const key = `tx:${owner.toLowerCase()}`;
    const raw = await kv.lrange(key, 0, 199);
    const kvItems = raw.map((r: any) => typeof r === "string" ? JSON.parse(r) : r);

    const verified = [];
    const failed = [];

    for (const item of kvItems) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: item.txHash });

        if (receipt.status !== "success") {
          failed.push({ ...item, reason: "TX failed on-chain" });
          continue;
        }

        // ScheduleExecuted イベントログをレシートから探してデコード
        let matched = false;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: EVENT_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (
              decoded.eventName === "ScheduleExecuted" &&
              decoded.args.owner.toLowerCase() === item.owner.toLowerCase() &&
              decoded.args.recipient.toLowerCase() === item.recipient.toLowerCase() &&
              decoded.args.amount.toString() === item.amount.toString()
            ) {
              matched = true;
              break;
            }
          } catch { /* not this event, skip */ }
        }

        if (matched) {
          const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
          const swapInfo = extractSwapInfo(receipt.logs);
          verified.push({
            ...item,
            blockNumber: receipt.blockNumber.toString(),
            timestamp: Number(block.timestamp) * 1000,
            verified: true,
            swapInfo,
          });
        } else {
          failed.push({ ...item, reason: "Event data mismatch - possible tampering" });
        }
      } catch (e: any) {
        failed.push({ ...item, reason: "TX not found on-chain: " + e.message?.slice(0, 50) });
      }
    }

    return NextResponse.json({ verified, failed, totalChecked: kvItems.length });
  } catch (e: any) {
    console.error("[verified-report] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
