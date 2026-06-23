"use client";
import { useState, useEffect, useRef } from "react";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { setCookie, getCookie } from "cookies-next";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

type Props = { onConnected: (address: string, userToken?: string) => void; };

export default function CircleGoogleLogin({ onConnected }: Props) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [deviceEncKey, setDeviceEncKey] = useState("");
  const [loginResult, setLoginResult] = useState<{userToken:string;encryptionKey:string}|null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      if (cancelled) return;

      const onLoginComplete = (err: unknown, result: any) => {
        if (err) {
          const e = err as any;
          setError(e.message || "Login failed");
          setLoading(false);
          return;
        }
        setLoginResult({ userToken: result.userToken, encryptionKey: result.encryptionKey });
        setStatus("✅ Googleログイン成功！ウォレット初期化中…");
      };

      const restoredDeviceToken = (getCookie("deviceToken") as string) || "";
      const restoredDeviceEncKey = (getCookie("deviceEncKey") as string) || "";

      const sdk = new W3SSdk({
        appSettings: { appId: APP_ID },
        loginConfigs: {
          deviceToken: restoredDeviceToken,
          deviceEncryptionKey: restoredDeviceEncKey,
          google: {
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: typeof window !== "undefined" ? window.location.origin : "",
            selectAccountPrompt: true,
          },
        },
      }, onLoginComplete);

      sdkRef.current = sdk;
      if (restoredDeviceToken) setDeviceToken(restoredDeviceToken);
      if (restoredDeviceEncKey) setDeviceEncKey(restoredDeviceEncKey);

      // deviceId取得
      const cachedDeviceId = typeof window !== "undefined" ? localStorage.getItem("circle_deviceId") : null;
      if (cachedDeviceId) {
        setDeviceId(cachedDeviceId);
      } else {
        const id = await sdk.getDeviceId();
        setDeviceId(id);
        if (typeof window !== "undefined") localStorage.setItem("circle_deviceId", id);
      }

      if (!cancelled) setSdkReady(true);

      // Googleリダイレクト後の自動処理
      if (typeof window !== "undefined" && window.location.hash) {
        try {
          await (sdk as any).handleHashLoginResponse();
        } catch(e) {
          console.log("handleHashLoginResponse:", e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // loginResult取得後にウォレット初期化
  useEffect(() => {
    if (!loginResult) return;
    (async () => {
      try {
        // initializeUser
        const initRes = await fetch("/api/endpoints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "initializeUser", userToken: loginResult.userToken }),
        });
        const initData = await initRes.json();
        console.log("initializeUser response:", JSON.stringify(initData));

        if (initData.challengeId) {
          setStatus("PINを設定してください…");
          sdkRef.current!.setAuthentication({ userToken: loginResult.userToken, encryptionKey: loginResult.encryptionKey });
          sdkRef.current!.execute(initData.challengeId, async (err: any) => {
            if (err) { setError(err.message); setLoading(false); return; }
            await fetchWallet(loginResult.userToken);
          });
        } else {
          // 既存ユーザー
          await fetchWallet(loginResult.userToken);
        }
      } catch(e: any) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, [loginResult]);

  const fetchWallet = async (userToken: string) => {
    const res = await fetch("/api/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listWallets", userToken }),
    });
    const data = await res.json();
    console.log("listWallets response:", JSON.stringify(data));
    const wallet = data.wallets?.find((w: any) => w.blockchain === "ARC-TESTNET");
    if (wallet?.address) {
      setStatus("✅ 接続完了！");
      onConnected(wallet.address, userToken);
    } else {
      setError("ウォレットが見つかりません");
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!sdkRef.current || !deviceId) return;
    
    

    
    // 📱 スマホ用デバッグ：環境変数を画面にポップアップ表示
    const debugInfo = [
      "=== Google Login Debug ===",
      `NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}`,
      `NEXT_PUBLIC_CIRCLE_APP_ID: ${process.env.NEXT_PUBLIC_CIRCLE_APP_ID}`,
      `window.location.origin: ${typeof window !== "undefined" ? window.location.origin : "undefined"}`
    ].join("
");
    
    alert(debugInfo);

    
    // 🟢 Googleリダイレクト直前の環境変数デバッグ
    console.log("=== Google Login Frontend Env Check ===");
    console.log("NEXT_PUBLIC_CIRCLE_APP_ID:", process.env.NEXT_PUBLIC_CIRCLE_APP_ID);
    console.log("NEXT_PUBLIC_GOOGLE_CLIENT_ID:", process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
    console.log("Redirect URI:", typeof window !== "undefined" ? window.location.origin : "");
    
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID.includes("undefined")) {
      alert("❌ エラー: NEXT_PUBLIC_GOOGLE_CLIENT_ID がブラウザ側で読み込めていません！虚無(undefined)になっています。");
    }

    setLoading(true); setError(""); setStatus("deviceToken取得中…");

    try {
      // Step2: deviceToken取得（必須！）
      const tokenRes = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.deviceToken) {
        throw new Error(tokenData.message || `deviceToken取得失敗 (Status: ${tokenRes.status})`);
      }

      setDeviceToken(tokenData.deviceToken);
      setDeviceEncKey(tokenData.deviceEncryptionKey);
      setCookie("deviceToken", tokenData.deviceToken);
      setCookie("deviceEncKey", tokenData.deviceEncryptionKey);

      // Step3: SDKにdeviceTokenを渡してからlogin
      setCookie("appId", APP_ID);
      setCookie("google.clientId", GOOGLE_CLIENT_ID);

      sdkRef.current.updateConfigs({
        appSettings: { appId: APP_ID },
        loginConfigs: {
          deviceToken: tokenData.deviceToken,
          deviceEncryptionKey: tokenData.deviceEncryptionKey,
          google: {
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: window.location.origin,
            selectAccountPrompt: true,
          },
        },
      });

      setStatus("Googleにリダイレクト中…");
      sdkRef.current.performLogin(SocialLoginProvider.GOOGLE);
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
        disabled={!sdkReady||loading||!deviceId}
      >
        {loading ? <><span className="spinning">◌</span> {status}</>
        : "🔐 Googleでログイン →"}
      </button>
      {error && <div style={{fontSize:10,color:"#ff4d6d"}}>{error}</div>}
      {!loading && status && !error && <div style={{fontSize:10,color:"#00e5a0"}}>{status}</div>}
    </div>
  );
}
