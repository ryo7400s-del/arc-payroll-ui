import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const client = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
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
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            deviceId,
          }),
        });
        
        const data = await response.json();
        return NextResponse.json(response.ok ? data.data : data, { status: response.ok ? 200 : response.status });
      }

      case "initializeUser": {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json({ error: "userToken is required" }, { status: 400 });
        }

        // 🟢 SDKの型エラーを回避するため、ここも生の fetch で直接CircleのAPIを叩く
        const response = await fetch("https://api-sandbox.circle.com/v1/w3s/user/initialize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            userToken,
            blockchains: ["ARC-TESTNET"],
            accountType: "SCA"
          }),
        });

        const data = await response.json();
        return NextResponse.json(response.ok ? data.data : data, { status: response.ok ? 200 : response.status });
      }

      case "listWallets": {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json({ error: "userToken is required" }, { status: 400 });
        }

        // listWallets はさっきのチェックでSDK内に存在が確認できているのでこのままでOK
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
