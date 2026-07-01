import { createWalletClient, custom, parseUnits } from "viem";

export const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
} as const;

export const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
export const USDC_ABI = [
  { type:"function", name:"allowance", inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"approve", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },
] as const;

export type Employee = {
  label: string;
  to: `0x${string}`;
  amount: string;
  interval: number;
  firstExecution?: bigint;
  useEURC?: boolean;
};

export type StepStatus = "approving" | "scheduling" | "done" | "error";
export type ProgressCb = (index: number, status: StepStatus, error?: string, hash?: string) => void;

export async function addEmployeesBatch(
  employees: Employee[],
  ownerAddress: `0x${string}`,
  scheduler: `0x${string}`,
  abi: any,
  publicClient: any,
  onProgress?: ProgressCb,
  getPrivyProvider?: () => Promise<any>,
  privyWallets?: any[],
  isPrivyConnected?: boolean,
  circleUserToken?: string,
  circleWalletId?: string,
  isCircleConnected?: boolean
) {
  // Circle ウォレットの場合は contractExecution API を使う
  if (isCircleConnected && circleUserToken && circleWalletId) {
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      try {
        onProgress?.(i, "scheduling");
        const fe = emp.firstExecution ?? 0n;
        const res = await fetch("/api/circle-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userToken: circleUserToken,
            walletId: circleWalletId,
            schedulerAddress: scheduler,
            to: emp.to,
            amount: emp.amount,
            interval: emp.interval,
            label: emp.label || "Employee",
            firstExecution: fe.toString(),
            useEURC: emp.useEURC ?? false,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        onProgress?.(i, "done", undefined, data.challengeId);
      } catch (e: any) {
        onProgress?.(i, "error", e.message?.slice(0, 100));
      }
    }
    return;
  }

  let wc;
  if (isPrivyConnected && privyWallets) {
    const embWallet = privyWallets.find((w: any) => w.walletClientType === "privy");
    if (embWallet) {
      await embWallet.switchChain(5042002);
      const provider = await embWallet.getEthereumProvider();
      wc = createWalletClient({ account: ownerAddress, chain: arcTestnet, transport: custom(provider) });
    }
  }
  if (!wc) {
    wc = createWalletClient({ account: ownerAddress, chain: arcTestnet, transport: custom((window as any).ethereum) });
  }

  const allowance = await publicClient.readContract({
    address: USDC, abi: USDC_ABI, functionName: "allowance", args: [ownerAddress, scheduler],
  }) as bigint;
  const totalNeeded = employees.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);
  if (allowance < parseUnits(String(totalNeeded * 12), 6)) {
    onProgress?.(-1, "approving");
    const ah = await wc.writeContract({
      address: USDC, abi: USDC_ABI, functionName: "approve", args: [scheduler, parseUnits("1000000", 6)],
    });
    await publicClient.waitForTransactionReceipt({ hash: ah });
  }

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    try {
      onProgress?.(i, "scheduling");
      const sh = await wc.writeContract({
        address: scheduler, abi, functionName: "createSchedule",
        args: [emp.to, parseUnits(emp.amount, 6), BigInt(emp.interval), emp.label, emp.firstExecution ?? 0n, emp.useEURC ?? false],
      });
      await publicClient.waitForTransactionReceipt({ hash: sh });

      onProgress?.(i, "done", undefined, sh);
    } catch (e: any) {
      onProgress?.(i, "error", e.message?.slice(0, 100));
    }
  }
}
