"use client";

import React, { useEffect, useRef, useState } from "react";
import { convertChallengeIdToSmsInitial, initiateUserControlledWalletsWebClient } from "@circle-fin/user-controlled-wallets-web";

export default function CircleGoogleLogin() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const sdkRef = useRef<any>(null);

  useEffect(() => {
    // クライアント側でのみSDKを初期化
    const client = initiateUserControlledWalletsWebClient();
    sdkRef.current = client;

    // デバイスIDの生成・取得
    client.getDeviceId((id: string, error: any) => {
      if (error) {
        console.error("Device ID creation error:", error);
        return;
      }
      setDeviceId(id);
    });
  }, []);

  const handleLogin = async () => {
    if (!sdkRef.current || !deviceId) return;
    setLoading(true);

    try {
      // 1. バックエンドからdeviceTokenを取得
      const tokenRes = await fetch("/app/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) throw new Error(tokenData.error || "Failed to create device token");

      // 2. Circle Web SDK を使用してGoogleソーシャルログインを実行
      sdkRef.current.performLogin(
        {
          provider: "google",
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
          redirectUri: typeof window !== "undefined" ? window.location.origin : "",
        },
        async (error: any, loginResult: any) => {
          if (error) {
            console.error("Login error:", error);
            setLoading(false);
            return;
          }

          // 3. ログイン成功後、バックエンドを叩いてユーザーを初期化 (ウォレット作成)
          const initRes = await fetch("/app/api/endpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "initializeUser",
              userToken: loginResult.userToken,
            }),
          });
          const initData = await initRes.json();

          if (!initRes.ok) throw new Error(initData.error || "Failed to initialize user");

          console.log("User & Wallet Initialized successfully:", initData);
          setLoading(false);
        }
      );
    } catch (err: any) {
      console.error("Authentication Flow Error:", err);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <button
        onClick={handleLogin}
        disabled={loading || !deviceId}
        className="px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 transition"
      >
        {loading ? "Authenticating..." : "🔐 Googleでログイン"}
      </button>
    </div>
  );
}
