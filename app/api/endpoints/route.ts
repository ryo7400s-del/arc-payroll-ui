import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";

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

        const response = await client.createSocialLoginToken({
          deviceId,
        });

        return NextResponse.json(response.data);
      }

      case "initializeUser": {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json({ error: "userToken is required" }, { status: 400 });
        }

        const response = await client.initializeUserControlledWallets({
          userToken,
          blockchains: ["ARC-TESTNET"],
          accountType: "SCA"
        });

        return NextResponse.json(response.data);
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
