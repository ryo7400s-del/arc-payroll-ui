import { createPublicClient, http } from "viem";

const arcTestnet = {
  id:5042002, name:"Arc Testnet",
  nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},
  rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}}
};

const pc = createPublicClient({ chain: arcTestnet, transport: http() });

const codeNew = await pc.getBytecode({ address: "0xd3ea6652a52255749e036e730a13d0e252a7f50b" });
const codeSite = await pc.getBytecode({ address: "0x4527d313F02Ef2E77657D0022439Ab8D085d5E1f" });

console.log("New (confirmed fixed) length:", codeNew.length);
console.log("Site-deployed length:", codeSite.length);
console.log("Identical bytecode:", codeNew === codeSite);
