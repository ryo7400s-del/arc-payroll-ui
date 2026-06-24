"use client";

import React, { useState, useEffect } from "react";

interface CircleGoogleLoginProps {
  onConnected?: (userToken: string, encryptionKey: string) => void;
}

export default function CircleGoogleLogin({ onConnected }: CircleGoogleLoginProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // URLのハッシュ（#id_token=...）からGoogleのトークンを解析
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get("id_token");

      if (idToken) {
        processCircleWalletAuth(idToken);
      }
    }
  }, [onConnected]);

  const processCircleWalletAuth = async (idToken: string) => {
    setLoading(true);
    setStatusText("Circleウォレットを認証中...");

    try {
      const deviceId = "temp-device-id-" + Math.random().toString(36).substring(2);
      
      const tokenRes = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "createDeviceToken", 
          deviceId,
          idToken
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        throw new Error(tokenData.error || tokenData.message || JSON.stringify(tokenData));
      }

      console.log("🔥 Circle Auth Success:", tokenData);
      setStatusText("ログイン＆ウォレット取得大成功！");
      
      if (onConnected && tokenData.userToken) {
        onConnected(tokenData.userToken, tokenData.encryptionKey);
      }

      // URLの長いハッシュを消して綺麗にする
      window.history.replaceState(null, "", window.location.pathname);

    } catch (err: any) {
      console.error("Circle Login Error:", err);
      alert("❌ Circle認証エラー: " + err.message);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleGoogleRedirect = () => {
    setLoading(true);
    setStatusText("Googleへ移動中...");

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      alert("❌ NEXT_PUBLIC_GOOGLE_CLIENT_ID がVercelに設定されていません！");
      setLoading(false);
      return;
    }

    const redirectUri = typeof window !== "undefined" ? window.location.origin : "";
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=id_token` +
      `&scope=openid%20email%20profile` +
      `&nonce=circle_auth_nonce`;

    window.location.href = googleAuthUrl;
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <button
        onClick={handleGoogleRedirect}
        disabled={loading}
        className="px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 transition"
      >
        {loading ? statusText || "Authenticating..." : "🔐 Googleでログイン"}
      </button>
      {statusText && <p className="mt-2 text-sm text-blue-500 font-medium">{statusText}</p>}
    </div>
  );
}
