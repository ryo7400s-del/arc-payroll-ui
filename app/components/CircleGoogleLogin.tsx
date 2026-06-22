"use client";
import { useState, useEffect, useRef } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

type Props = {
  onConnected: (address: string) => void;
};

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
      const sdk = new W3SSdk({
        appSettings: { appId: APP_ID },
        loginConfigs: {
          deviceToken: "",
          deviceEncryptionKey: "",
          google: {
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: window.location.origin,
          },
        },
      });
      sdkRef.current = sdk;
      setSdkReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGoogleLogin = async () => {
    if (!sdkRef.current) return;
    setLoading(true); setError(""); setStatus("Googleでログイン中…");
    try {
      // Google OAuth実行
      await sdkRef.current.performLogin("google", async (result: any) => {
        const userId = result?.oAuthInfo?.sub || result?.oAuthInfo?.email;
        if (!userId) throw new Error("Google認証失敗");
        setStatus("Circle Walletを設定中…");

        // サーバーからtokenを取得
        const res = await fetch("/api/circle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (data.challengeId) {
          // 初回：PIN設定チャレンジ
          setStatus("PINを設定してください…");
          sdkRef.current!.setAuthentication({
            userToken: data.userToken,
            encryptionKey: data.encryptionKey,
          });
          await sdkRef.current!.execute(data.challengeId, async (err: any, result: any) => {
            if (err) throw err;
            // ウォレット作成後アドレス取得
            const walletRes = await fetch(`/api/circle?userId=${encodeURIComponent(userId)}`);
            const walletData = await walletRes.json();
            if (walletData.walletAddress) {
              setStatus("✅ 接続完了！");
              onConnected(walletData.walletAddress);
            }
          });
        } else if (data.walletAddress) {
          setStatus("✅ 接続完了！");
          onConnected(data.walletAddress);
        }
      });
    } catch(e: any) {
      setError(e.message || "ログイン失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:10,letterSpacing:".14em",color:"#3dd6f5",textTransform:"uppercase",marginBottom:4}}>
        🌐 Circle Wallet（Googleログイン）
      </div>
      <button
        className="submit-btn"
        style={{background:"#ffffff10",border:"1px solid #3dd6f5",color:"#3dd6f5"}}
        onClick={handleGoogleLogin}
        disabled={!sdkReady||loading}
      >
        {loading ? <><span className="spinning">◌</span> {status}</>
        : "🔐 Googleでログイン →"}
      </button>
      {error && <div style={{fontSize:10,color:"#ff4d6d"}}>{error}</div>}
      {!loading && status && !error && (
        <div style={{fontSize:10,color:"#00e5a0"}}>{status}</div>
      )}
    </div>
  );
}
