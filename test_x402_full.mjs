import { createWalletClient, createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, toBytes, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const arcTestnet = { id:5042002, name:"Arc Testnet", nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18}, rpcUrls:{default:{http:["https://rpc.testnet.arc.network"]}} };
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wc = createWalletClient({ account, chain:arcTestnet, transport:http() });

const MERCHANT = "0x83c4586C744832e4C66F3B58E773687fA8E64a09";
const amount = parseUnits("3", 6);
const nonce = BigInt(Date.now());
const expiry = BigInt(Math.floor(Date.now()/1000) + 300);

const innerHash = keccak256(encodeAbiParameters(
  parseAbiParameters("address, address, uint256, uint256, uint256"),
  [account.address, MERCHANT, amount, expiry, nonce]
));

const signature = await wc.signMessage({ message:{ raw: toBytes(innerHash) } });

// POST to API
const res = await fetch("https://arc-payroll-ui.vercel.app/api/x402", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    payer: account.address,
    amount: amount.toString(),
    expiry: expiry.toString(),
    nonce: nonce.toString(),
    signature,
    content: "payroll-report",
    merchant: MERCHANT
  })
});

const data = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data, null, 2));
