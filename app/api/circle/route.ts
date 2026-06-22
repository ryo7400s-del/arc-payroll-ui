import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { NextRequest, NextResponse } from "next/server";

const client = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});

// ユーザー作成 & deviceToken取得
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  
  try {
    // ユーザー作成（既存なら無視）
    try {
      await client.createUser({ userId });
    } catch {}

    // userTokenとencryptionKeyを取得
    const tokenRes = await client.createUserToken({ userId });
    const { userToken, encryptionKey } = tokenRes.data!;

    // ウォレットが既にあるか確認
    const walletsRes = await client.listWallets({ userId });
    const wallets = walletsRes.data?.wallets || [];
    const arcWallet = wallets.find(w => w.blockchain === "ARC-TESTNET");

    let challengeId = null;
    if (!arcWallet) {
      // 初回：ウォレット作成チャレンジを発行
      const walletRes = await client.createUserPinWithWallets({
        userId,
        blockchains: ["ARC-TESTNET"],
      });
      challengeId = walletRes.data?.challengeId;
    }

    return NextResponse.json({
      userToken,
      encryptionKey,
      challengeId,
      walletAddress: arcWallet?.address || null,
    });
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ウォレットアドレス取得
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try {
    const walletsRes = await client.listWallets({ userId });
    const wallets = walletsRes.data?.wallets || [];
    const arcWallet = wallets.find(w => w.blockchain === "ARC-TESTNET");
    return NextResponse.json({ walletAddress: arcWallet?.address || null });
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
