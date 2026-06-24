"use client";
import { useState, useRef } from "react";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

interface Props {
  onConnected?: (addr: string, token?: string) => void;
}

export default function CircleGoogleLogin({ onConnected }: Props) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString("ja-JP");
    const fullMsg = `[${timestamp}] ${msg}`;
    console.log(fullMsg);
    setDebugLogs((prev) => [...prev.slice(-25), fullMsg]);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    setStatus("デバイスを登録中...");
    setDebugLogs([]);

    try {
      addLog("🚀 プロセス開始: SDKのインポート");
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

      // ==========================================
      // STEP 1: デバイスIDの取得 (ログイン画面を開く前)
      // ==========================================
      addLog("🔍 デバイスIDを取得中...");
      const tempSdk = new W3SSdk({ appSettings: { appId: APP_ID } });
      const deviceId = await tempSdk.getDeviceId();
      addLog(`✅ deviceId取得完了: ${deviceId}`);

      // ==========================================
      // STEP 2: バックエンドからデバイストークンを取得
      // ==========================================
      addLog("📡 バックエンドに deviceToken をリクエスト...");
      const tokenRes = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData?.deviceToken) {
        throw new Error(tokenData?.error || "deviceTokenの取得に失敗しました");
      }
      addLog(`✅ deviceToken 取得完了`);

      // ==========================================
      // STEP 3: Google認証完了後のコールバック定義
      // ==========================================
      const onLoginComplete = async (err: unknown, result: any) => {
        if (err) {
          const e = err as any;
          addLog(`❌ SDKログインエラー: ${e?.message || JSON.stringify(e)}`);
          setError(`ログイン失敗: ${e?.message || JSON.stringify(e)}`);
          setLoading(false);
          return;
        }

        try {
          addLog("✅ Googleログイン成功 - userTokenを受信しました");

          // SDKへ認証セッションを固定
          sdkRef.current!.setAuthentication({
            userToken: result.userToken,
            encryptionKey: result.encryptionKey || "",
          });
          addLog("✅ setAuthentication 完了");

          // ==========================================
          // STEP 4: initializeUser (バックエンド経由でウォレット初期化)
          // ==========================================
          setStatus("ウォレット初期化中...");
          addLog("📡 バックエンドに initializeUser をリクエスト...");
          const initRes = await fetch("/api/endpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "initializeUser", userToken: result.userToken }),
          });
          const initData = await initRes.json();

          if (!initRes.ok) throw new Error(initData?.error || "initializeUserに失敗しました");
          addLog(`📡 initializeUser API: ${initRes.status} ✅`);

          // ==========================================
          // STEP 5: PIN チャレンジ処理 (新規ユーザーの場合のみ)
          // ==========================================
          if (initData?.challengeId) {
            addLog(`🔐 PIN チャレンジを開始します: ${initData.challengeId}`);
            sdkRef.current!.execute(initData.challengeId, async (err2: any) => {
              if (err2) {
                addLog(`❌ PIN チャレンジエラー: ${err2?.message}`);
                setError(err2?.message || "PIN チャレンジに失敗しました");
                setLoading(false);
              } else {
                addLog("✅ PIN チャレンジ完了");
                await fetchWallet(result.userToken);
              }
            });
          } else {
            addLog("ℹ️ PIN チャレンジ不要（既存ユーザー）");
            await fetchWallet(result.userToken);
          }
        } catch (e: any) {
          addLog(`❌ ログイン後処理エラー: ${e.message}`);
          setError(e.message);
          setLoading(false);
        }
      };

      // ==========================================
      // STEP 6: 正しいトークンを乗せた本番SDKインスタンスの作成 & 実行
      // ==========================================
      setStatus("Googleにリダイレクト中...");
      addLog("🚀 Googleログイン画面を展開します");

      const activeSdk = new W3SSdk(
        {
          appSettings: { appId: APP_ID },
          loginConfigs: {
            deviceToken: tokenData.deviceToken,
            deviceEncryptionKey: tokenData.deviceEncryptionKey,
            google: {
              clientId: GOOGLE_CLIENT_ID,
              redirectUri: "https://arc-payroll-ui.vercel.app",
            },
          },
        },
        onLoginComplete
      );

      sdkRef.current = activeSdk;
      await activeSdk.performLogin(SocialLoginProvider.GOOGLE);
    } catch (e: any) {
      addLog(`❌ プロセスエラー: ${e.message}`);
      setError(e.message);
      setLoading(false);
    }
  };

  const fetchWallet = async (userToken: string) => {
    try {
      addLog("🔍 ウォレットを検索中...");
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "listWalletsに失敗しました");

      const wallets = data?.wallets || [];
      const wallet = wallets.find((w: any) => w.blockchain === "ARC-TESTNET");

      if (wallet?.address) {
        addLog(`✅ ARC-TESTNET ウォレット発見: ${wallet.address}`);
        setStatus("✅ 接続完了！");
        onConnected?.(wallet.address, userToken);
      } else {
        throw new Error("ARC-TESTNET ウォレットが見つかりません");
      }
    } catch (e: any) {
      addLog(`❌ fetchWallet エラー: ${e.message}`);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="notranslate" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "#3dd6f5", fontWeight: "bold" }}>
        🌐 Circle Wallet（Googleログイン）
      </div>

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: "14px 20px",
          fontSize: "16px",
          background: "#ffffff10",
          border: "1px solid #3dd6f5",
          color: "#3dd6f5",
          borderRadius: "8px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? "処理中..." : "🔐 Googleでログイン"}
      </button>

      {status && <div style={{ color: "#00e5a0" }}>{status}</div>}
      {error && <div style={{ color: "#ff4d6d", wordBreak: "break-all" }}>{error}</div>}

      <div
        style={{
          fontSize: "12px",
          background: "#111",
          color: "#bbb",
          padding: "12px",
          borderRadius: "8px",
          maxHeight: "340px",
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          lineHeight: "1.4",
          fontFamily: "monospace",
        }}
      >
        DEBUG LOG ({debugLogs.length})<br />
        {debugLogs.length === 0 && "ログはここに表示されます..."}
        {debugLogs.map((log, i) => (
          <div key={i} style={{ marginTop: "4px" }}>
            • {log}
          </div>
        ))}
      </div>
    </div>
  );
}
