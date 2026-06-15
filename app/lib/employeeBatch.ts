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
};

export type StepStatus = "approving" | "whitelisting" | "scheduling" | "done" | "error";

export async function addEmployeesBatch(
  employees: Employee[],
  ownerAddress: `0x${string}`,
  scheduler: `0x${string}`,
  abi: any,
  publicClient: any,
  onProgress?: (index: number, status: StepStatus, error?: string) => void
) {
  const wc = createWalletClient({ account: ownerAddress, chain: arcTestnet, transport: custom((window as any).ethereum) });

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
      const isWl = await publicClient.readContract({
        address: scheduler, abi, functionName: "isWhitelisted", args: [ownerAddress, emp.to],
      }) as boolean;

      if (!isWl) {
        onProgress?.(i, "whitelisting");
        const wh = await wc.writeContract({
          address: scheduler, abi, functionName: "addToWhitelist", args: [emp.to],
        });
        await publicClient.waitForTransactionReceipt({ hash: wh });
      }

      onProgress?.(i, "scheduling");
      const sh = await wc.writeContract({
        address: scheduler, abi, functionName: "createSchedule",
        args: [emp.to, parseUnits(emp.amount, 6), BigInt(emp.interval), emp.label, emp.firstExecution ?? 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash: sh });

      onProgress?.(i, "done");
    } catch (e: any) {
      onProgress?.(i, "error", e.message?.slice(0, 100));
    }
  }
}
