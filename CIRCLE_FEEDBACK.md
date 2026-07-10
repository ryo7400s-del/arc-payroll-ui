# Circle Product Feedback

Submitted alongside Arc Payroll Protocol for the Circle Developer Bounty \u2014 Ignyte Challenge.

---

## Why did you choose these products for your use case?

### Circle User-Controlled Wallets

Payroll is a use case where the wallet has to satisfy two audiences at once: a company's finance team, who need enterprise-grade security they can trust with real money, and individual employees, who should not be expected to manage a browser extension or a seed phrase.

Circle User-Controlled Wallets answer both:

- **Custody without our company holding any risk.** Private keys are managed by Circle's infrastructure rather than our servers or the employee's own device \u2014 exactly the security posture a finance department wants before approving a payroll tool.
- **Google login instead of a wallet install.** No extension, no seed phrase to lose, no "which browser supports MetaMask" problem.
- **Works on mobile Safari.** Since there's no extension dependency, the same flow works identically on iOS Safari, which has no browser-extension ecosystem at all \u2014 this matters because a meaningful share of our target users are on mobile.

### EURC

We're building for cross-border payroll, and the Euro is not an edge case \u2014 it represents roughly 20% of global currency usage, and any serious international payroll product has to serve euro-denominated employees on day one, not as a future roadmap item.

EURC being Circle's own stablecoin, and the leading euro-denominated stablecoin by liquidity, made it the obvious choice: it's the same trust and redemption model as USDC, issued by the same entity we're already building around for wallets.

---

## What went well during development?

- **We ended up leaning on Circle-adjacent infrastructure more than we originally planned.** Even though StableFX and Chainlink Automation aren't integrated yet, the architecture naturally converged toward "this is exactly what Circle's ecosystem is built for" \u2014 wallets, stablecoin FX, and scheduled execution all point back to Circle or Arc-ecosystem-partner products.
- **The "company deploys its own contract" model.** Rather than pooling every company's funds into one shared contract, each company deploys and owns an immutable `PaymentScheduler`. Funds are never deposited or held by us \u2014 the company grants an ERC-20 allowance to its own contract, which caps exposure at whatever the company chooses to approve rather than exposing a full balance.
- **CSV bulk scheduling was a genuine "wow" moment in our own testing.** Being able to paste a CSV with different amounts, different currencies (USDC or EURC), different cadences, and different start dates per row, and have the entire payroll run created in seconds, ended up being the single most compelling demo of the whole project \u2014 more than we expected going in.

---

## What could be improved?

- **StableFX integration.** Our current USDC\u2194EURC conversion runs through a testnet Curve pool as a stand-in, which does not have the rate stability a production FX product needs. This wasn't ready in time for the hackathon, but is the first thing we'd replace with StableFX once it's available for this kind of integration.
- **Execution decentralization.** For the demo, we needed judges to be able to clearly see *how* scheduled execution actually works, so we built it on a GitHub Actions cron \u2014 visible, simple to explain, easy to trigger on demand. But we're aware this is a centralization and security compromise (a single GitHub repo's secrets become a meaningful trust dependency). The moment Chainlink Automation is available on Arc mainnet, this is the first infrastructure piece we'd migrate.
- **Circle-side UX still shows its MetaMask-shaped origins.** This project started as a MetaMask-first app and Circle Wallet support was added on top of that foundation. The clearest symptom: without Multicall-style batching available through `contractExecution`, our CSV bulk-import for Circle wallets confirms sequentially \u2014 one PIN per row \u2014 instead of the single-transaction experience MetaMask and Privy users get. We plan to address this with a Circle-wallet-native contract and app (see below), not by continuing to retrofit a MetaMask-first design.

  **Planned direction:** a new contract designed around Circle's calling patterns from the start (so bulk actions genuinely batch), paired with a simplified, wallet-app-style UI built specifically for Circle User-Controlled Wallets \u2014 plus a two-step approval payment flow (an employee proposes a schedule, a finance approver confirms via email/Telegram before first execution) aimed at compliance-conscious enterprise customers.

---

## What would make the product or developer experience more seamless?

- **Contract-deployment transactions (`to: null`) for User-Controlled Wallets on Arc.** We found that `signTransaction` currently rejects Arc Testnet as an unsupported chain, and the raw-Hex workaround (`blockchain: "ETH"` with an Arc chain ID embedded in the transaction) fails Circle's own parameter validation. If User-Controlled Wallets could sign and broadcast a genuine contract-creation transaction on Arc, we could let a Circle-wallet user deploy and own their payroll contract directly, rather than routing deployment through a disposable backend wallet and having the user's wallet only call `register()` afterward.
- **Multicall-style batching through `contractExecution`.** Even a narrowly-scoped version \u2014 e.g. explicitly supporting an array of `(target, callData)` pairs for calls to a single pre-approved contract \u2014 would let Circle wallet users get the same "one signature, many actions" experience MetaMask and Privy users already have via Multicall3.
- **Social-identity-linked payment addresses, similar in spirit to Sui's zkLogin.** Since Circle Wallets already authenticate via Google or email, it would be extremely valuable if a payment could be addressed directly to a Google account or email identity rather than a raw hex address \u2014 and if Arc's own block explorer could resolve that same social identity to a sub-address. For payroll specifically, this would remove the recurring manual step of matching wallet addresses against an employee list, which is both tedious and one of the more error-prone parts of running payroll today.
