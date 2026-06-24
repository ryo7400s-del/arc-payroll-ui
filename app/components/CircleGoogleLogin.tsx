"use client";
import { useState, useEffect, useRef } from "react";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

interface Props {
  onConnected?: (addr: string, token?: string) => void;
}

export default function CircleGoogleLogin({ onConnected }: Props) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString("ja-JP");
    const fullMsg = `[${timestamp}] ${msg}`;
    console.log(fullMsg);
    setDebugLogs(prev => [...prev.slice(-25), fullMsg]);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        if (cancelled) return;

        addLog("✅ SDK import completed");

        const onLoginComplete = async (err: unknown, result: any) => {
          // ステップごとの状態をリセット
          const stepStatus = {
            sdkInitialization: true,
            googleLogin: !!result,
            idTokenExtracted: false,
            deviceIdObtained: false,
            backendDeviceTokenCreated: false,
            authenticationSet: false,
            initializeUserCompleted: false,
            walletFetched: false,
          };

          addLog(`[診断開始] ログイン結果: ${stepStatus.googleLogin ? "成功" : "失敗"}`);

          if (err) {
            const e = err as any;
            console.error("🔴 DEBUG ERROR OBJECT:", err);
            
            addLog(`❌ エラー発生: ${e?.message || JSON.stringify(err)}`);
            if (e?.code) {
              addLog(`❌ エラーコード: ${e.code}`);
            }

            setError(`ログイン失敗: ${e?.message || err}`);
            setLoading(false);
            return;
          }

          try {
            // ========== Step 1: idToken 抽出 ==========
            const idToken = result?.oAuthInfo?.idToken;
            stepStatus.idTokenExtracted = !!idToken;
            addLog(
              `🔍 Step 1 - idTokenの抽出: ${stepStatus.idTokenExtracted ? "✅ true" : "❌ failed"}`
            );

            if (!stepStatus.idTokenExtracted) {
              addLog(
                `📋 result.oAuthInfo: ${JSON.stringify(result?.oAuthInfo || {})}`
              );
              throw new Error("idTokenが取得できませんでした");
            }

            // ========== Step 2: deviceId 取得 ==========
            if (!sdkRef.current) {
              throw new Error("sdkRef.current is null");
            }

            const deviceId = await sdkRef.current.getDeviceId();
            stepStatus.deviceIdObtained = !!deviceId;
            addLog(
              `🔍 Step 2 - デバイスID取得: ${stepStatus.deviceIdObtained ? "✅ true" : "❌ failed"}`
            );

            if (!stepStatus.deviceIdObtained) {
              throw new Error("deviceIdが取得できませんでした");
            }

            // ========== Step 3: バックエンド - createDeviceToken ==========
            setStatus("deviceToken取得中...");
            addLog("📡 Step 3 - バックエンド連携開始: createDeviceToken");

            const tokenRes = await fetch("/api/endpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "createDeviceToken",
                deviceId,
                idToken,
              }),
            });

            const tokenData = await tokenRes.json();
            stepStatus.backendDeviceTokenCreated = tokenRes.ok && !!tokenData?.deviceToken;

            addLog(
              `🔍 Step 3 - デバイストークンAPI連携: ${
                stepStatus.backendDeviceTokenCreated ? "✅ true" : "❌ failed"
              } (Status: ${tokenRes.status})`
            );

            if (!stepStatus.backendDeviceTokenCreated) {
              addLog(`📋 API Response: ${JSON.stringify(tokenData)}`);
              throw new Error(
                tokenData?.error || `API failed with status ${tokenRes.status}`
              );
            }

            // ========== Step 4: setAuthentication ==========
            const userToken = result?.userToken;
            const encryptionKey = result?.encryptionKey || result?.oAuthInfo?.encryptionKey;

            addLog(`🔑 userToken: ${userToken ? "✅ exists" : "❌ missing"}`);
            addLog(`🔑 encryptionKey: ${encryptionKey ? "✅ exists" : "❌ missing"}`);

            sdkRef.current.setAuthentication({
              userToken: userToken || "",
              encryptionKey: encryptionKey || "",
            });

            stepStatus.authenticationSet = true;
            addLog(
              `🔍 Step 4 - 認証情報のセット: ${
                stepStatus.authenticationSet ? "✅ true" : "❌ failed"
              }`
            );

            // ========== Step 5: バックエンド - initializeUser ==========
            setStatus("ウォレット初期化中...");
            addLog("📡 Step 5 - バックエンド連携開始: initializeUser");

            const initRes = await fetch("/api/endpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "initializeUser",
                userToken,
              }),
            });

            const initData = await initRes.json();
            stepStatus.initializeUserCompleted = initRes.ok;

            addLog(
              `🔍 Step 5 - ウォレット初期化API連携: ${
                stepStatus.initializeUserCompleted ? "✅ true" : "❌ failed"
              } (Status: ${initRes.status})`
            );

            if (!stepStatus.initializeUserCompleted) {
              addLog(`📋 API Response: ${JSON.stringify(initData)}`);
              throw new Error(
                initData?.error || `API failed with status ${initRes.status}`
              );
            }

            // ========== Step 6: PIN Challenge (if needed) ==========
            if (initData?.challengeId) {
              addLog(`🔐 PIN Challenge detected: ${initData.challengeId}`);
              sdkRef.current.execute(
                initData.challengeId,
                async (err2: any) => {
                  if (err2) {
                    addLog(`❌ PIN Challenge Error: ${err2?.message}`);
                    setError(err2?.message || "PIN Challenge failed");
                    setLoading(false);
                  } else {
                    addLog("✅ PIN Challenge completed");
                    await fetchWallet(userToken);
                  }
                }
              );
            } else {
              addLog("ℹ️  No PIN Challenge required - Proceeding to wallet fetch");
              await fetchWallet(userToken);
            }
          } catch (e: any) {
            addLog(`❌ 診断終了 - 失敗箇所あり: ${e.message}`);
            addLog(`📊 完了ステップ: ${Object.entries(stepStatus)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "なし"}`);
            setError(`プロセス停止: ${e.message}`);
            setLoading(false);
          }
        };

        addLog(`📋 SDK Config - APP_ID: ${APP_ID?.substring(0, 15)}...`);
        addLog(
          `📋 SDK Config - GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID?.substring(0, 15)}...`
        );
        addLog(`📋 SDK Config - redirectUri: https://arc-payroll-ui.vercel.app`);

        const sdk = new W3SSdk(
          {
            appSettings: { appId: APP_ID },
            loginConfigs: {
              deviceToken: "",
              deviceEncryptionKey: "",
              google: {
                clientId: GOOGLE_CLIENT_ID,
                redirectUri: "https://arc-payroll-ui.vercel.app",
              },
            },
          },
          onLoginComplete
        );

        sdkRef.current = sdk;
        setSdkReady(true);
        addLog("✅ SDK Ready");
      } catch (e: any) {
        addLog(`❌ SDK initialization error: ${e.message}`);
        setError(`SDK初期化エラー: ${e.message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchWallet = async (userToken: string) => {
    try {
      addLog("🔍 Step 7 - ウォレット取得開始: listWallets");
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken }),
      });

      const data = await res.json();
      const success = res.ok && data?.wallets;

      addLog(`🔍 Step 7 - ウォレット取得: ${success ? "✅ true" : "❌ failed"} (Status: ${res.status})`);

      if (!success) {
        throw new Error(
          data?.error || `listWallets failed with status ${res.status}`
        );
      }

      const wallets = data?.wallets || [];
      addLog(`📋 取得ウォレット数: ${wallets.length}`);

      const wallet = wallets.find((w: any) => w.blockchain === "ARC-TESTNET");

      if (wallet?.address) {
        addLog(`✅ ARC-TESTNET wallet found: ${wallet.address}`);
        addLog("🎉 全てのログイン工程が完了しました！");
        setStatus("✅ 接続完了！");
        onConnected?.(wallet.address, userToken);
      } else {
        const blockchains = wallets.map((w: any) => w.blockchain).join(", ");
        throw new Error(
          `ARC-TESTNET wallet not found. Available: ${blockchains || "none"}`
        );
      }
    } catch (e: any) {
      const msg = e.message || "Wallet retrieval failed";
      addLog(`❌ fetchWallet Error: ${msg}`);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!sdkRef.current || !sdkReady) {
      setError("SDK準備中です...");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Googleにリダイレクト中...");
    setDebugLogs([]);

    try {
      addLog("🚀 Starting Google login flow...");
      await sdkRef.current.performLogin(SocialLoginProvider.GOOGLE);
    } catch (e: any) {
      const msg = e.message || "performLogin failed";
      addLog(`❌ performLogin Error: ${msg}`);
      setError(msg);
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
        disabled={!sdkReady || loading}
        style={{
          padding: "14px 20px",
          fontSize: "16px",
          background: "#ffffff10",
          border: "1px solid #3dd6f5",
          color: "#3dd6f5",
          borderRadius: "8px",
          cursor: !sdkReady || loading ? "not-allowed" : "pointer",
          opacity: !sdkReady || loading ? 0.5 : 1,
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
