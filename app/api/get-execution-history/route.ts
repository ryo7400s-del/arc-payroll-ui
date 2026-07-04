import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const owner = req.nextUrl.searchParams.get("owner");
    if (!owner) {
      return NextResponse.json({ error: "owner required" }, { status: 400 });
    }

    const key = `tx:${owner.toLowerCase()}`;
    const raw = await kv.lrange(key, 0, 199);
    const items = raw.map((r: any) => typeof r === "string" ? JSON.parse(r) : r);

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error("[get-execution-history] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
