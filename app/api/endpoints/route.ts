import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const client = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY || "dummy",
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.CIRCLE_API_KEY;
    
    // 🔍 1. そもそも環境変数がVercelに登録されているかチェック
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
        
        // 🔍 2. エラーが起きたら、使用されたAPIキーのヒントを画面に返す
        if (!response.ok) {
          const keyHint = apiKey.substring(0, 12);
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
