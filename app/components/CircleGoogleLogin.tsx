"use client";

import React, { useState } from "react";

export default function CircleGoogleLogin() {
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    setLoading(true);

    try {
      // 1. バックエンドからdeviceTokenを取得（検証用に一応叩く、またはGoogleログイン後に処理）
      const deviceId = "temp-device-id-" + Math.random().toString(36).substring(2);
      const tokenRes = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) throw new Error(tokenData.error || "Failed to create device token");

      // 2. Google OAuth 認証画面への手動リダイレクト
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = typeof window !== "undefined" ? window.location.origin : "";
      
      // Googleログイン用のURLを手動で構築
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=id_token` +
        `&scope=openid%20email%20profile` +
        `&nonce=circle_auth_nonce` +
        `&id_token_hint=`;

      // Googleログイン画面へ遷移
      window.location.href = googleAuthUrl;

    } catch (err: any) {
      console.error("Authentication Flow Error:", err);
      alert("エラーが発生しました: " + err.message);
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
