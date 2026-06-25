// app/api/circle-deploy/route.ts
// Circle ウォレット用 — デプロイ署名チャレンジを作成する
// MetaMask の処理はフロントのみで完結するためここには関係しない

import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const RPC_URL = "https://rpc.testnet.arc.network";

// DeployContract.tsx と同じ BYTECODE（長いので先頭だけ示す）
const BYTECODE =
  "0x6080604052348015600e575f5ffd5b506127318061001c5f395ff3fe608060405234801561000f575f5ffd5b5060043610610111575f3560e01c806389a302711161009e578063aabfa37d1161006e578063aabfa37d146102b8578063b6b35272146102d3578063de244e45146102f6578063e43252d714610309578063f4359ce51461031c575f5ffd5b806389a302711461025c5780638ab1d681146102675780639105c6f21461027a5780639e55d1df1461028d575f5ffd5b80634b0f43fd116100e45780634b0f43fd1461018f5780636c04e040146101b05780637027ea6c146101d05780637b22c5a01461021657806386a8b4b514610229575f5ffd5b806308f81a93146101155780630e6922e8146101475780632e159e431461015c57806330edc0f51461016f575b5f5ffd5b61013461012336600461210c565b60046020525f908152604090205481565b6040519081526020015b60405180910390f35b61015a610155366004612125565b610326565b005b61013461016a36600461215c565b61078e565b61018261017d36600461210c565b6111d6565b60405161013e9190612184565b6101a261019d36600461215c565b611249565b60405161013e9291906121fd565b6101c36101be36600461210c565b611748565b60405161013e919061221f565b6101e36101de36600461210c565b6118b6565b60405161013e91908151815260208083015190820152604080830151908201526060918201519181019190915260800190565b61013461022436600461210c565b611929565b610244732d84d79c852f6842abe0304b70bbaa1506add45781565b6040516001600160a01b03909116815260200161013e565b610244601b60991b81565b61015a61027536600461210c565b6119a7565b61015a6102883660046122fd565b611b50565b6102a061029b366004612338565b611c11565b6040516001600160601b03909116815260200161013e565b6102447389b50855aa3be2f677cd6303cec089b5f319d72a81565b6102e66102e13660046123e2565b611e86565b604051901515815260200161013e565b61015a610304366004612413565b611eb5565b61015a61031736600461210c565b611f4d565b61013462093a8081565b80606001354211156103695760405162461bcd60e51b8152602060048201526007602482015266115e1c1a5c995960ca1b6044820152606401" as `0x${string}`;

export async function POST(req: NextRequest) {
  try {
    const { userId, walletId, walletAddress } = await req.json();

    if (!userId || !walletId || !walletAddress) {
      return NextResponse.json(
        { error: "userId / walletId / walletAddress が必要です" },
        { status: 400 }
      );
    }

    // ① Circle SDK 初期化
    const client = initiateUserControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
    });

    // ② userToken + encryptionKey を取得
    //    encryptionKey は SDK の setAuthentication に渡す必須パラメータ
    const { data: tokenData } = await client.createUserToken({ userId });
    const userToken = tokenData!.userToken;
    const encryptionKey = tokenData!.encryptionKey; // ← バグ①の修正: 空文字では NG

    // ③ rawTransaction を組み立て
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const [nonce, feeData, network] = await Promise.all([
      provider.getTransactionCount(walletAddress),
      provider.getFeeData(),
      provider.getNetwork(),
    ]);

    const tx = ethers.Transaction.from({
      type: 2,
      chainId: Number(network.chainId),
      nonce,
      maxFeePerGas: feeData.maxFeePerGas ?? ethers.parseUnits("2", "gwei"),
      maxPriorityFeePerGas:
        feeData.maxPriorityFeePerGas ?? ethers.parseUnits("1", "gwei"),
      gasLimit: 3_000_000n, // デプロイは重いので多めに
      data: BYTECODE,
      value: 0n,
      // to: undefined → コントラクト デプロイ トランザクション
    });

    // ④ signTransaction チャレンジ作成
    //    → フロントで sdk.execute(challengeId) を呼ぶとユーザーに PIN 画面が出る
    const { data: challengeData } = await client.signTransaction({
      userToken,
      walletId,
      rawTransaction: tx.unsignedSerialized,
      idempotencyKey: randomUUID(),
    });

    return NextResponse.json({
      challengeId: challengeData!.challengeId,
      userToken,
      encryptionKey, // ← フロントの sdk.setAuthentication に渡す
    });
  } catch (e: any) {
    console.error("[circle-deploy] ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

