"use client";

import React, { useState } from "react";

interface CircleGoogleLoginProps {
  onConnected?: (addr: any, token: any) => void;
}

export default function CircleGoogleLogin({ onConnected }: CircleGoogleLoginProps) {
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    setLoading(true);

    try {
      // 1. バックエンドからdeviceTokenを取得
      const deviceId = "temp-device-id-" + Math.random().toString(36).substring(2);
      const tokenRes = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        // 🔍 CircleやNext.jsが返した「本当のエラー理由」を抽出
        const errorDetail = tokenData.message || tokenData.error || JSON.stringify(tokenData);
        throw new Error(errorDetail);
      }

      // 2. Google OAuth 認証画面への手動リダイレクト
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = typeof window !== "undefined" ? window.location.origin : "";
      
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=id_token` +
        `&scope=openid%20email%20profile` +
        `&nonce=circle_auth_nonce` +
        `&id_token_hint=`;

      window.location.href = googleAuthUrl;

    } catch (err: any) {
      console.error("Authentication Flow Error:", err);
      // 📱 スマホの画面に生のエラー内容を強制表示
      alert("❌ エラー詳細: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <button
        onClick={handleLogin}
        disabled={loading}
        className="px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 transition"
      >
        {loading ? "Authenticating..." : "🔐 Googleでログイン"}
      </button>
    </div>
  );
}
