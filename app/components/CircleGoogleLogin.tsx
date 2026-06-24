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
    console.log(msg);
    setDebugLogs(prev => [...prev.slice(-15), msg]);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        if (cancelled) return;

        addLog("SDK import completed");

        const onLoginComplete = async (err: unknown, result: any) => {
          if (err) {
            const e = err as any;
            const errMsg = e?.message || JSON.stringify(e);
            addLog(`Login Error: ${errMsg}`);
            setError(`ログイン失敗: ${errMsg}`);
            setLoading(false);
            return;
          }

          addLog("Googleログイン成功");
          console.log("Full Login Result:", result);

          try {
            const idToken = result?.idToken || result?.oAuthInfo?.idToken;
            if (!idToken) throw new Error("idTokenが見つかりません");

            const deviceId = await sdkRef.current!.getDeviceId();
            addLog(`deviceId: ${deviceId}`);

            setStatus("deviceToken取得中...");
            const tokenRes = await fetch("/api/endpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "createDeviceToken", deviceId, idToken }),
            });

            const tokenData = await tokenRes.json();
            addLog(`deviceToken Response: ${tokenRes.ok ? "OK" : "NG"}`);

            if (!tokenRes.ok || !tokenData?.deviceToken) {
              throw new Error(tokenData?.error || "deviceToken取得失敗");
            }

            sdkRef.current!.setAuthentication({
              userToken: result.userToken,
              encryptionKey: result.encryptionKey || "",
            });

            addLog("setAuthentication 完了");

            setStatus("ウォレット初期化中...");
            const initRes = await fetch("/api/endpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "initializeUser", userToken: result.userToken }),
            });

            const initData = await initRes.json();

            if (initData?.challengeId) {
              addLog("PIN設定 Challenge開始");
              sdkRef.current!.execute(initData.challengeId, async (err2: any) => {
                if (err2) {
                  setError(err2.message);
                  setLoading(false);
                  return;
                }
                await fetchWallet(result.userToken);
              });
            } else {
              await fetchWallet(result.userToken);
            }
          } catch (e: any) {
            const msg = e.message || "処理エラー";
            addLog(`Post-login Error: ${msg}`);
            setError(msg);
            setLoading(false);
          }
        };

        const sdk = new W3SSdk({
          appSettings: { appId: APP_ID },
          loginConfigs: {
            google: {
              clientId: GOOGLE_CLIENT_ID,
              redirectUri: typeof window !== "undefined" ? window.location.origin : "",
            },
          },
        }, onLoginComplete);

        sdkRef.current = sdk;
        if (!cancelled) {
          setSdkReady(true);
          addLog("SDK Ready");
        }
      } catch (e: any) {
        addLog(`SDK初期化エラー: ${e.message}`);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const fetchWallet = async (userToken: string) => {
    try {
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken }),
      });
      const data = await res.json();
      const wallet = data?.wallets?.find((w: any) => w.blockchain === "ARC-TESTNET");

      if (wallet?.address) {
        setStatus("✅ 接続完了！");
        onConnected?.(wallet.address, userToken);
      } else {
        setError("ウォレットが見つかりません");
      }
    } catch (e: any) {
      setError("ウォレット取得失敗: " + e.message);
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!sdkRef.current || !sdkReady) {
      setError("SDKが準備できていません");
      return;
    }
    setLoading(true);
    setError("");
    setStatus("Googleにリダイレクト中...");
    setDebugLogs([]);

    try {
      await sdkRef.current.performLogin(SocialLoginProvider.GOOGLE);
    } catch (e: any) {
      setError(e.message || "performLogin失敗");
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
        }}
      >
        {loading ? "処理中..." : "🔐 Googleでログイン"}
      </button>

      {status && <div style={{ color: "#00e5a0", fontSize: 14 }}>{status}</div>}
      {error && <div style={{ color: "#ff4d6d", fontSize: 14, wordBreak: "break-all" }}>{error}</div>}

      <div style={{
        fontSize: "12px",
        background: "#111",
        color: "#bbb",
        padding: "12px",
        borderRadius: "8px",
        maxHeight: "280px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        lineHeight: "1.4"
      }}>
        DEBUG LOG ({debugLogs.length})<br />
        {debugLogs.length === 0 && "ログはここに表示されます..."}
        {debugLogs.map((log, i) => (
          <div key={i} style={{ marginTop: "4px" }}>• {log}</div>
        ))}
      </div>
    </div>
  );
}
