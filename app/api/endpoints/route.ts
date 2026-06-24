import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    // 🟢 .trim() をつけて、コピペ時に入り込んだ見えないスペースや改行を完全に消し去る
    const apiKey = process.env.CIRCLE_API_KEY?.trim();
    
    if (!apiKey) {
      return NextResponse.json({ 
        error: "❌ Vercelの環境変数に CIRCLE_API_KEY が設定されていません！" 
      }, { status: 500 });
    }

    const body = await req.json();
    const { action, ...params } = body ?? {};

    console.log("=== Circle Action ===", action, params);

    switch (action) {
      case "createDeviceToken": {
        const { deviceId } = params;
        if (!deviceId) {
          return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
        }

        const response = await fetch("https://api-sandbox.circle.com/v1/w3s/users/social/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            deviceId,
          }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          const keyHint = apiKey.substring(0, 15);
          return NextResponse.json({ 
            error: `Circle API拒否: ${data.message || JSON.stringify(data)} (キーの先頭: ${keyHint}...)` 
          }, { status: response.status });
        }
        
        return NextResponse.json(data.data);
      }

      case "initializeUser": {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json({ error: "userToken is required" }, { status: 400 });
        }

        const response = await fetch("https://api-sandbox.circle.com/v1/w3s/user/initialize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            userToken,
            blockchains: ["ARC-TESTNET"],
            accountType: "SCA"
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
        }
        return NextResponse.json(data.data);
      }

      case "listWallets": {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json({ error: "userToken is required" }, { status: 400 });
        }

        // ここも安全のため trim 済みのキーでクライアントを初期化
        const client = initiateUserControlledWalletsClient({
          apiKey: apiKey,
        });

        const response = await client.listWallets({
          userToken,
        });

        return NextResponse.json(response.data);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("❌ Circle API Error:", e);
    return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
  }
}
