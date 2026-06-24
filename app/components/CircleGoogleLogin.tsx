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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      if (cancelled) return;

      // ログイン完了コールバック（SDK公式準拠）
      const onLoginComplete = async (err: unknown, result: any) => {
        if (err) {
          const e = err as any;
          setError(e.message || "ログイン失敗");
          setLoading(false);
          return;
        }
        console.log("Login result:", JSON.stringify(result));
        setStatus("ウォレット確認中…");

        try {
          const userToken = result?.userToken;
          if (!userToken) throw new Error("userToken取得失敗");

          // ウォレット初期化（初回のみchallengeId発行）
          const initRes = await fetch("/api/endpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "initializeUser", userToken }),
          });
          const initData = await initRes.json();
          console.log("initializeUser:", JSON.stringify(initData));

          if (initData.challengeId) {
            setStatus("PINを設定してください…");
            sdkRef.current!.setAuthentication({
              userToken,
              encryptionKey: result?.encryptionKey || "",
            });
            sdkRef.current!.execute(initData.challengeId, async (err2: any) => {
              if (err2) { setError(err2.message); setLoading(false); return; }
              await fetchWallet(userToken);
            });
          } else {
            await fetchWallet(userToken);
          }
        } catch(e: any) {
          setError(e.message);
          setLoading(false);
        }
      };

      // deviceTokenをバックエンドから取得
      const deviceId = sdkRef.current
        ? await (new W3SSdk({ appSettings: { appId: APP_ID }, loginConfigs: { deviceToken: "", deviceEncryptionKey: "" } })).getDeviceId()
        : "temp-" + Math.random().toString(36).slice(2);

      const tokenRes = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();
      const deviceToken = tokenData?.deviceToken || "";
      const deviceEncryptionKey = tokenData?.deviceEncryptionKey || "";

      const sdk = new W3SSdk({
        appSettings: { appId: APP_ID },
        loginConfigs: {
          deviceToken,
          deviceEncryptionKey,
          google: {
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: typeof window !== "undefined" ? window.location.origin : "",
          },
        },
      }, onLoginComplete);

      sdkRef.current = sdk;
      if (!cancelled) setSdkReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchWallet = async (userToken: string) => {
    const res = await fetch("/api/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listWallets", userToken }),
    });
    const data = await res.json();
    console.log("listWallets:", JSON.stringify(data));
    const wallet = data?.wallets?.find((w: any) => w.blockchain === "ARC-TESTNET");
    if (wallet?.address) {
      setStatus("✅ 接続完了！");
      onConnected?.(wallet.address, userToken);
    } else {
      setError("ウォレットが見つかりません: " + JSON.stringify(data));
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!sdkRef.current) return;
    setLoading(true); setError(""); setStatus("Googleログイン中…");
    try {
      await sdkRef.current.performLogin(SocialLoginProvider.GOOGLE);
    } catch(e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#3dd6f5",textTransform:"uppercase",marginBottom:4}}>
        🌐 Circle Wallet（Googleログイン）
      </div>
      <button className="submit-btn"
        style={{background:"#ffffff10",border:"1px solid #3dd6f5",color:"#3dd6f5"}}
        onClick={handleLogin}
        disabled={!sdkReady||loading}
      >
        {loading ? <><span className="spinning">◌</span> {status || "処理中…"}</>
        : "🔐 Googleでログイン →"}
      </button>
      {error && <div style={{fontSize:10,color:"#ff4d6d",wordBreak:"break-all"}}>{error}</div>}
      {!loading && status && !error && <div style={{fontSize:10,color:"#00e5a0"}}>{status}</div>}
    </div>
  );
}
