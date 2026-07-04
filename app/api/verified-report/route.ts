import { kv } from "@vercel/kv";
import { createPublicClient, http, decodeEventLog } from "viem";
import { NextRequest, NextResponse } from "next/server";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
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
          verified.push({
            ...item,
            blockNumber: receipt.blockNumber.toString(),
            timestamp: Number(block.timestamp) * 1000,
            verified: true,
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
