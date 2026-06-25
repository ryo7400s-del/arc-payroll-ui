"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { setCookie, getCookie } from "cookies-next";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";

const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string;
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;

export type CircleWallet = {
  id: string;
  address: string;
  blockchain: string;
  accountType: string;
};

export type CircleWalletState = {
  wallet: CircleWallet | null;
  userToken: string | null;
  encryptionKey: string | null; // ← 追加: DeployContract の sdk.setAuthentication に必要
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
};

const CircleWalletContext = createContext<CircleWalletState>({
  wallet: null,
  userToken: null,
  encryptionKey: null, // ← 追加
  isConnected: false,
  isLoading: false,
  error: null,
  login: async () => {},
  logout: () => {},
});

export function CircleWalletProvider({ children }: { children: React.ReactNode }) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [wallet, setWallet] = useState<CircleWallet | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initSdk = async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        const restoredDeviceToken = (getCookie("circle_deviceToken") as string) || "";
        const restoredDeviceEncKey = (getCookie("circle_deviceEncryptionKey") as string) || "";

        const onLoginComplete = async (loginError: unknown, result: any) => {
          if (cancelled) return;
          if (loginError) {
            const err = loginError as any;
            setError(err.message || "ログインに失敗しました");
            setIsLoading(false);
            return;
          }
          const { userToken: uToken, encryptionKey: eKey } = result;
          setUserToken(uToken);
          setEncryptionKey(eKey);
          await initializeAndLoadWallet(uToken, eKey);
        };

        const sdk = new W3SSdk(
          {
            appSettings: { appId },
            loginConfigs: {
              deviceToken: restoredDeviceToken,
              deviceEncryptionKey: restoredDeviceEncKey,
              google: {
                clientId: googleClientId,
                redirectUri: typeof window !== "undefined" ? window.location.origin : "",
                selectAccountPrompt: true,
              },
            },
          },
          onLoginComplete
        );

        sdkRef.current = sdk;
        if (!cancelled) setSdkReady(true);
      } catch (err) {
        console.error("Circle SDK init failed:", err);
      }
    };
    void initSdk();
    return () => { cancelled = true; };
  }, []);

  const initializeAndLoadWallet = useCallback(async (uToken: string, eKey: string) => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    try {
      setIsLoading(true);
      const initRes = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initializeUser", userToken: uToken }),
      });
      const initData = await initRes.json();

      if (!initRes.ok) {
        if (initData.code === 155106) {
          await loadWallet(uToken);
          return;
        }
        throw new Error(initData.message || "初期化に失敗しました");
      }

      const { challengeId } = initData;
      sdk.setAuthentication({ userToken: uToken, encryptionKey: eKey });

      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (execError) => {
          if (execError) reject(execError);
          else resolve();
        });
      });

      await new Promise((r) => setTimeout(r, 2000));
      await loadWallet(uToken);
    } catch (err: any) {
      setError(err.message || "ウォレット作成に失敗しました");
      setIsLoading(false);
    }
  }, []);

  const loadWallet = useCallback(async (uToken: string) => {
    try {
      const res = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken: uToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "ウォレット取得失敗");
      const wallets: CircleWallet[] = data.wallets || [];
      if (wallets.length > 0) setWallet(wallets[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk || !sdkReady) {
      setError("SDK が準備できていません。少し待ってから再試行してください。");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const deviceId = await sdk.getDeviceId();
      const tokenRes = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.message || "デバイストークン取得失敗");

      const { deviceToken, deviceEncryptionKey } = tokenData;
      setCookie("circle_deviceToken", deviceToken);
      setCookie("circle_deviceEncryptionKey", deviceEncryptionKey);

      sdk.updateConfigs({
        appSettings: { appId },
        loginConfigs: {
          deviceToken,
          deviceEncryptionKey,
          google: {
            clientId: googleClientId,
            redirectUri: window.location.origin,
            selectAccountPrompt: true,
          },
        },
      });

      sdk.performLogin(SocialLoginProvider.GOOGLE);
    } catch (err: any) {
      setError(err.message || "ログインに失敗しました");
      setIsLoading(false);
    }
  }, [sdkReady]);

  const logout = useCallback(() => {
    setWallet(null);
    setUserToken(null);
    setEncryptionKey(null);
    setError(null);
    setCookie("circle_deviceToken", "");
    setCookie("circle_deviceEncryptionKey", "");
    if (typeof window !== "undefined") localStorage.removeItem("deviceId");
  }, []);

  return (
    <CircleWalletContext.Provider
      value={{
        wallet,
        userToken,
        encryptionKey, // ← 追加: これがないと DeployContract で sdk.setAuthentication できない
        isConnected: !!wallet,
        isLoading,
        error,
        login,
        logout,
      }}
    >
      {children}
    </CircleWalletContext.Provider>
  );
}

export function useCircleWallet() {
  return useContext(CircleWalletContext);
}

