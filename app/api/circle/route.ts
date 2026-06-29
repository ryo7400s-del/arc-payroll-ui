import { NextResponse } from "next/server";

const CIRCLE_BASE_URL = "https://api.circle.com";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY as string;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...params } = body ?? {};

    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    switch (action) {
      case "initializeUser": {
        const { userToken } = params;
        const res = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/user/initialize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CIRCLE_API_KEY}`,
            "X-User-Token": userToken,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            accountType: "EOA",
            blockchains: ["ARC-TESTNET"],
          }),
        });

        // 💡 409エラー(初期化済み)は成功扱いにする
        if (res.status === 409) {
          return NextResponse.json({ message: "Already initialized", status: "success" }, { status: 200 });
        }
        
        const data = await res.json();
        if (!res.ok) return NextResponse.json(data, { status: res.status });
        return NextResponse.json(data.data, { status: 200 });
      }

      // 他のケース (createDeviceToken, listWallets など)...
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
