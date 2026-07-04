import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { secret, owner, recipient, amount, txHash, scheduler, label } = await req.json();

    if (secret !== process.env.RECORD_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!owner || !recipient || !amount || !txHash || !scheduler) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const key = `tx:${owner.toLowerCase()}`;
    const entry = {
      owner, recipient, amount, txHash, scheduler,
      label: label || "",
      timestamp: Date.now(),
    };

    // 直近200件だけ保持するリストとして保存
    await kv.lpush(key, JSON.stringify(entry));
    await kv.ltrim(key, 0, 199);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[record-execution] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
