// app/api/circle-deploy/result/route.ts
// ユーザーが PIN を入力して署名した後に呼ぶ
// 署名済みトランザクションを取得して Arc にブロードキャストし、コントラクトアドレスを返す

import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

const RPC_URL = "https://rpc.testnet.arc.network";
const REGISTRY = "0xc01c0113e353c6fc1be7d32a80e9688e1256b81f" as const;
const REGISTRY_ABI = [
  "function register(address scheduler, string name)",
] as const;

export async function POST(req: NextRequest) {
  try {
    const { challengeId, userToken, companyName } = await req.json();

    if (!challengeId || !userToken) {
      return NextResponse.json(
        { error: "challengeId / userToken が必要です" },
        { status: 400 }
      );
    }

    const client = initiateUserControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
    });

    // ① チャレンジ完了まで polling（最大 60 秒）
    //    バグ②の修正: SDK コールバックの result にコントラクトアドレスは入っていない
    //    → Circle API から署名済み TX を取得して自前でブロードキャストする必要がある
    let signature: string | null = null;

    for (let i = 0; i < 30; i++) {
      const { data } = await client.getUserChallenge({ userToken, challengeId });
      const challenge = data!.challenge!;

      if (challenge.status === "COMPLETED") {
        // challenge.signature = 署名済み rawTransaction（そのままブロードキャスト可）
        signature = (challenge as any).signature ?? null;
        break;
      }
      if (challenge.status === "FAILED" || challenge.status === "EXPIRED") {
        throw new Error(`チャレンジが ${challenge.status} になりました`);
      }

      await new Promise((r) => setTimeout(r, 2000)); // 2秒待ってリトライ
    }

    if (!signature) {
      throw new Error("署名の取得がタイムアウトしました（60秒）");
    }

    // ② Arc テストネットにブロードキャスト
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const txResponse = await provider.broadcastTransaction(signature);
    const receipt = await txResponse.wait();

    const contractAddress = receipt?.contractAddress;
    if (!contractAddress) {
      throw new Error("レシートにコントラクトアドレスが含まれていません");
    }

    // ③ Registry に登録（USDC ガスが必要）
    //    MetaMask と同じ REGISTRY.register を呼ぶが、ここは developer ウォレットで代行
    //    ※ 本番では Circle の別チャレンジで登録するか、バックエンドのガスウォレットで実行
    try {
      const devWallet = new ethers.Wallet(
        process.env.REGISTRY_SIGNER_PK!, // バックエンドの秘密鍵（Registry 登録専用）
        provider
      );
      const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, devWallet);
      const regTx = await registry.register(
        contractAddress,
        companyName || "My Company"
      );
      await regTx.wait();
    } catch (regErr) {
      // Registry 失敗はデプロイには影響しないのでログだけ
      console.warn("[circle-deploy/result] Registry 登録スキップ:", regErr);
    }

    return NextResponse.json({
      contractAddress,
      txHash: txResponse.hash,
    });
  } catch (e: any) {
    console.error("[circle-deploy/result] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

