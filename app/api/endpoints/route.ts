import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.CIRCLE_API_KEY?.trim();
    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() || process.env.CIRCLE_APP_ID?.trim();

    if (!apiKey) return NextResponse.json({ error: "CIRCLE_API_KEY missing" }, { status: 500 });
    if (!appId) return NextResponse.json({ error: "CIRCLE_APP_ID missing" }, { status: 500 });

    const body = await req.json();
    const { action, ...params } = body ?? {};
    console.log("=== Circle Action ===", action);

    switch (action) {
      case "createDeviceToken": {
        const { deviceId, idToken } = params;
        if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

        const response = await fetch("https://api-sandbox.circle.com/v1/w3s/users/social/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-App-Id": appId,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            deviceId,
            ...(idToken ? { idToken } : {}),
          }),
        });
        const data = await response.json();
        console.log("createDeviceToken:", response.status, JSON.stringify(data));
        if (!response.ok) return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
        return NextResponse.json(data.data);
      }

      case "initializeUser": {
        const { userToken } = params;
        if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });
        const response = await fetch("https://api-sandbox.circle.com/v1/w3s/user/initialize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-App-Id": appId,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            userToken,
            blockchains: ["ARC-TESTNET"],
            accountType: "SCA",
          }),
        });
        const data = await response.json();
        console.log("initializeUser:", response.status, JSON.stringify(data));
        if (!response.ok) return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
        return NextResponse.json(data.data);
      }

      case "listWallets": {
        const { userToken } = params;
        if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });
        const client = initiateUserControlledWalletsClient({
          apiKey,
          baseUrl: "https://api-sandbox.circle.com/v1/w3s",
        });
        const response = await client.listWallets({ userToken });
        return NextResponse.json(response.data);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch(e: any) {
    console.error("Circle API Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
