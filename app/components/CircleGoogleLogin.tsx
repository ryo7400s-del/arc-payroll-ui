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
          if (err) {
            const e = err as any;
            const errMsg = e?.message || JSON.stringify(e);
            addLog(`❌ SDK Login Error: ${errMsg}`);
            setError(`ログイン失敗: ${errMsg}`);
            setLoading(false);
            return;
          }

          addLog("✅ Googleログイン成功 - result received");
          addLog(`🔍 result keys: ${Object.keys(result || {}).join(", ")}`);
          addLog(`🔍 result.oAuthInfo exists: ${!!result?.oAuthInfo}`);

          try {
            // ========== Step 1: idToken 抽出 ==========
            const idToken = result?.oAuthInfo?.idToken;
            if (!idToken) {
              throw new Error(
                `idTokenが見つかりません (result: ${JSON.stringify(result)})`
              );
            }
            addLog(`✅ idToken extracted: ${idToken.substring(0, 20)}...`);

            // ========== Step 2: deviceId 取得 ==========
            if (!sdkRef.current) {
              throw new Error("sdkRef.current is null");
            }
            const deviceId = await sdkRef.current.getDeviceId();
            addLog(`✅ deviceId obtained: ${deviceId}`);

            // ========== Step 3: createDeviceToken (バックエンド) ==========
            setStatus("deviceToken取得中...");
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
            addLog(
              `📡 createDeviceToken API: ${tokenRes.status} ${
                tokenRes.ok ? "✅" : "❌"
              }`
            );

            if (!tokenRes.ok) {
              throw new Error(
                tokenData?.error ||
                  `createDeviceToken failed: ${tokenRes.statusText}`
              );
            }

            if (!tokenData?.deviceToken) {
              throw new Error(
                `deviceToken not in response: ${JSON.stringify(tokenData)}`
              );
            }

            addLog(
              `✅ deviceToken received: ${tokenData.deviceToken.substring(0, 20)}...`
            );

            // ========== Step 4: setAuthentication ==========
            const encryptionKey =
              result.encryptionKey || result?.oAuthInfo?.encryptionKey;
            if (!encryptionKey) {
              addLog(
                `⚠️  Warning: encryptionKey is empty or missing. result keys: ${Object.keys(result).join(", ")}`
              );
            }

            sdkRef.current.setAuthentication({
              userToken: result.userToken,
              encryptionKey: encryptionKey || "",
            });
            addLog("✅ setAuthentication completed");

            // ========== Step 5: initializeUser (バックエンド) ==========
            setStatus("ウォレット初期化中...");
            const initRes = await fetch("/api/endpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "initializeUser",
                userToken: result.userToken,
              }),
            });

            const initData = await initRes.json();
            addLog(`📡 initializeUser API: ${initRes.status}`);

            if (!initRes.ok) {
              throw new Error(
                initData?.error || `initializeUser failed: ${initRes.statusText}`
              );
            }

            // ========== Step 6: PIN Challenge (if needed) ==========
            if (initData?.challengeId) {
              addLog(`🔐 PIN Challenge started: ${initData.challengeId}`);
              sdkRef.current.execute(
                initData.challengeId,
                async (err2: any) => {
                  if (err2) {
                    addLog(`❌ PIN Challenge Error: ${err2?.message}`);
                    setError(err2?.message || "PIN Challenge failed");
                    setLoading(false);
                  } else {
                    addLog("✅ PIN Challenge completed");
                    await fetchWallet(result.userToken);
                  }
                }
              );
            } else {
              addLog("ℹ️  No PIN Challenge required");
              await fetchWallet(result.userToken);
            }
          } catch (e: any) {
            const msg = e.message || "Post-login processing error";
            addLog(`❌ Post-login Error: ${msg}`);
            setError(msg);
            setLoading(false);
          }
        };

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
      addLog("🔍 Fetching wallets...");
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken }),
      });

      const data = await res.json();
      addLog(`📡 listWallets API: ${res.status}`);

      if (!res.ok) {
        throw new Error(
          data?.error || `listWallets failed: ${res.statusText}`
        );
      }

      const wallets = data?.wallets || [];
      addLog(`✅ Found ${wallets.length} wallet(s)`);

      const wallet = wallets.find((w: any) => w.blockchain === "ARC-TESTNET");

      if (wallet?.address) {
        addLog(`✅ ARC-TESTNET wallet found: ${wallet.address}`);
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
