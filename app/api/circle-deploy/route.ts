import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import path from "path";

const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
} as const;

const REGISTRY = "0xc01c0113e353c6fc1be7d32a80e9688e1256b81f" as `0x${string}`;
const REGISTRY_ABI = [
  { type:"function", name:"register", inputs:[{name:"scheduler",type:"address"},{name:"name",type:"string"}], outputs:[] },
] as const;

export async function POST(req: NextRequest) {
  const { companyName } = await req.json();

  if (!process.env.DEPLOY_PRIVATE_KEY) {
    return NextResponse.json({ error: "DEPLOY_PRIVATE_KEY not set" }, { status: 500 });
  }

  try {
    const account = privateKeyToAccount(process.env.DEPLOY_PRIVATE_KEY as `0x${string}`);
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http() });
    const pc = createPublicClient({ chain: arcTestnet, transport: http() });

    const bytecode = ("0x" + readFileSync(path.join(process.cwd(), "lib/contract.bin"), "utf8").trim()) as `0x${string}`;

    const hash = await wc.deployContract({ abi: [], bytecode, account });
    const receipt = await pc.waitForTransactionReceipt({ hash });
    const contractAddr = receipt.contractAddress!;

    const rh = await wc.writeContract({
      address: REGISTRY, abi: REGISTRY_ABI, functionName: "register",
      args: [contractAddr, companyName || "My Company"],
    });
    await pc.waitForTransactionReceipt({ hash: rh });

    return NextResponse.json({ contractAddress: contractAddr });
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
