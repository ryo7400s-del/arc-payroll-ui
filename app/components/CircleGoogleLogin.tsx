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
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const sdkRef = useRef<W3SSdk | null>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString("ja-JP");
    const fullMsg = `[${timestamp}] ${msg}`;
    console.log(fullMsg);
    setDebugLogs((prev) => [...prev.slice(-25), fullMsg]);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    setDebugLogs([]);

    try {
      addLog("🚀 プロセス開始: SDKのインポート");
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

      // ==========================================
      // STEP 1: デバイスIDの取得 (Googleログイン画面を開く前！)
      // ==========================================
      setStatus("デバイスを登録中...");
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
      addLog(`✅ deviceEncryptionKey 取得完了`);

      // ==========================================
      // STEP 3: SDKにデバイストークンをセットして、Googleログイン！
      // ==========================================
      setStatus("Google認証を開いています...");
      addLog("🚀 Googleログイン画面を展開します");

      const onLoginComplete = async (err: unknown, result: any) => {
        if (err) {
          const e = err as any;
          addLog(`❌ Googleログインエラー: ${e?.message || JSON.stringify(e)}`);
          setError(`Google認証失敗: ${e?.message || JSON.stringify(e)}`);
          setLoading(false);
          return;
        }

        try {
          addLog("✅ Google認証完了！CircleからuserTokenを受け取りました");

          // ==========================================
          // STEP 4: SDKへの認証情報のセット
          // ==========================================
          const userToken = result.userToken;
          const encryptionKey = result.encryptionKey;

          if (!userToken) throw new Error("userTokenが含まれていません");

          sdkRef.current!.setAuthentication({ userToken, encryptionKey });
          addLog("✅ SDKにuserTokenをセットしました");

          // ==========================================
          // STEP 5: ウォレットの初期化 (initializeUser)
          // ==========================================
          setStatus("ウォレットを準備中...");
          addLog("📡 バックエンドに initializeUser をリクエスト...");
          const initRes = await fetch("/api/endpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "initializeUser", userToken }),
          });
          const initData = await initRes.json();

          if (!initRes.ok) throw new Error(initData?.error || "initializeUserに失敗しました");
          addLog(`✅ initializeUser完了`);

          // ==========================================
          // STEP 6: 必要に応じてウォレット作成チャレンジの実行
          // ==========================================
          if (initData?.challengeId) {
            addLog(`🔐 ウォレット作成チャレンジを実行します: ${initData.challengeId}`);
            sdkRef.current!.execute(initData.challengeId, async (err2: any) => {
              if (err2) {
                addLog(`❌ チャレンジ失敗: ${err2.message}`);
                setError(err2.message);
                setLoading(false);
              } else {
                addLog("✅ チャレンジ成功！");
                await fetchWallet(userToken);
              }
            });
          } else {
            addLog("ℹ️ チャレンジ不要（既存ユーザー）");
            await fetchWallet(userToken);
          }
        } catch (postErr: any) {
          addLog(`❌ ログイン後処理エラー: ${postErr.message}`);
          setError(postErr.message);
          setLoading(false);
        }
      };

      // デバイストークンを持たせた本番用SDKインスタンスの作成
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

      // SDK内部でGoogle認証を呼び出し
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

      if (!res.ok) throw new Error(data?.error || "listWallets失敗");

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
      setError("ウォレット取得失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
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
