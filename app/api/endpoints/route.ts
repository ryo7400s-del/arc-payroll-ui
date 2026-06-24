import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.CIRCLE_API_KEY?.trim();
    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() || process.env.CIRCLE_APP_ID?.trim();

    if (!apiKey) {
      console.error("❌ CIRCLE_API_KEY が設定されていません！");
      return NextResponse.json(
        { error: "バックエンドの CIRCLE_API_KEY が設定されていません！.env を確認してください" },
        { status: 500 }
      );
    }
    if (!appId) {
      console.error("❌ CIRCLE_APP_ID が設定されていません！");
      return NextResponse.json({ error: "CIRCLE_APP_ID missing" }, { status: 500 });
    }

    const body = await req.json();
    const { action, ...params } = body ?? {};
    console.log("=== Circle Action ===", action);

    switch (action) {
      case "createDeviceToken": {
        const { deviceId } = params;
        if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

        console.log("📡 createDeviceToken リクエスト開始");
        console.log(`🔑 API Key Prefix: ${apiKey.substring(0, 15)}...`);
        console.log(`📱 Device ID: ${deviceId}`);

        // deviceId だけをCircle APIに送信
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
          }),
        });

        const data = await response.json();
        console.log("📡 Circle API Response Status:", response.status);
        console.log("📡 Circle API Response:", JSON.stringify(data, null, 2));

        if (!response.ok) {
          console.error("❌ Circle API Error:", data.message || JSON.stringify(data));
          return NextResponse.json(
            { error: `Circle API エラー: ${data.message || JSON.stringify(data)}` },
            { status: response.status }
          );
        }

        console.log("✅ createDeviceToken 成功");
        return NextResponse.json(data.data);
      }

      case "initializeUser": {
        const { userToken } = params;
        if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });

        console.log("📡 initializeUser リクエスト開始");

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
        console.log("📡 Circle API Response Status:", response.status);
        console.log("📡 Circle API Response:", JSON.stringify(data, null, 2));

        if (!response.ok) {
          console.error("❌ Circle API Error:", data.message || JSON.stringify(data));
          return NextResponse.json(
            { error: `Circle API エラー: ${data.message || JSON.stringify(data)}` },
            { status: response.status }
          );
        }

        console.log("✅ initializeUser 成功");
        return NextResponse.json(data.data);
      }

      case "listWallets": {
        const { userToken } = params;
        if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });

        console.log("📡 listWallets リクエスト開始");

        const client = initiateUserControlledWalletsClient({
          apiKey,
          baseUrl: "https://api-sandbox.circle.com/v1/w3s",
        });

        const response = await client.listWallets({ userToken });
        console.log("✅ listWallets 成功");
        return NextResponse.json(response.data);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("❌ Circle API Error:", e.message);
    console.error("Stack Trace:", e.stack);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
