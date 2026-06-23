import { NextResponse } from "next/server";

const CIRCLE_BASE_URL = "https://api-sandbox.circle.com";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY as string;

export async function POST(request: Request) {
  const body = await request.json();
  const { action, ...params } = body ?? {};

  switch (action) {
    case "createDeviceToken": {
      const { deviceId } = params;
      const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/users/social/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}` },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId }),
      });
      const data = await response.json();
      return NextResponse.json(response.ok ? data.data : data, { status: response.ok ? 200 : response.status });
    }
    case "initializeUser": {
      const { userToken } = params;
      const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/user/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), accountType: "SCA", blockchains: ["ARC-TESTNET"] }),
      });
      const data = await response.json();
      return NextResponse.json(response.ok ? data.data : data, { status: response.ok ? 200 : response.status });
    }
    case "listWallets": {
      const { userToken } = params;
      const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/wallets`, {
        headers: { accept: "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
      });
      const data = await response.json();
      return NextResponse.json(response.ok ? data.data : data, { status: response.ok ? 200 : response.status });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
