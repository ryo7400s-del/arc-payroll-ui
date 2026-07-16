# Arc Payroll Protocol

**Enterprise on-chain payroll with wallet-agnostic execution, built on Arc Testnet and Circle User-Controlled Wallets.**

Arc Payroll Protocol enables companies to automate recurring cross-border payroll in USDC or EURC. It combines Circle User-Controlled Wallets for a Google OAuth and PIN-gated wallet experience—without browser extensions, seed phrases, or application-held company private keys—with on-chain payroll reports that independently reconstruct and verify each FX payment from Arc transaction receipts rather than trusting database records.

**Current FX rail:** Curve StableSwap on Arc Testnet.
**Production FX path:** Circle StableFX on Arc.

Submitted for the Circle Developer Bounty — Ignyte Challenge.

- **Live app:** https://arc-payroll-ui.vercel.app
- **Demo video:** https://photos.app.goo.gl/HAuJM24YX2MFVMXh9
- **Presentation:** https://docs.google.com/presentation/d/1xdesd5LCkuu9ru28B5ncsYkQb7t8KNi-/edit?usp=drivesdk&ouid=100941869062530340934&rtpof=true&sd=true
- **Main repository (frontend + API):** https://github.com/ryo7400s-del/arc-payroll-ui
- **Contracts + automated execution:** https://github.com/ryo7400s-del/arc-payroll-core — holds `PaymentScheduler.sol`, `Registry.sol`, and the `auto-execute.mjs` script that a GitHub Actions cron runs every 6 hours to settle due payments across every registered company
- **Deployed contracts (Arc Testnet):**
  - `Registry.sol`: `0xc01C0113e353c6Fc1bE7D32A80E9688e1256b81F`
  - `PaymentScheduler.sol` (example company deployment): `0x91b1F3B731cC7B6d8878e7D1AFC90f0dC7441815`
- **Team / submitter:** ryo7400s-del
- **Track:** Stablecoin FX (USDC ↔ EURC) + Wallets

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Why This Matters for Circle](#2-why-this-matters-for-circle)
3. [Architecture](#3-architecture)
4. [Circle Integration Details](#4-circle-integration-details)
5. [Stablecoin FX — Verifiable, Not Just Executed](#5-stablecoin-fx--verifiable-not-just-executed)
6. [Feature List](#6-feature-list)
7. [How to Use](#7-how-to-use)
8. [Running Locally](#8-running-locally)
9. [What's Next](#9-whats-next)

---


## 1. What This Is

Arc Payroll Protocol lets a company deploy its own on-chain payroll contract, whitelist employee wallets, schedule recurring USDC (or EURC) payments, and have those payments execute automatically — with a full, independently re-verifiable audit trail.

The defining design decision: **every feature works identically across three very different wallet models.**

| Wallet | Who it's for | How the user authenticates |
|---|---|---|
| **MetaMask** | Crypto-native teams | Browser extension, direct signing |
| **Privy** | Teams who want Web2 UX with self-custody | Google login → embedded wallet |
| **Circle User-Controlled Wallets** | Enterprise / finance teams | Google OAuth → PIN-gated wallet, Circle holds no custody risk for us and the user holds no seed phrase |

No feature is gated behind a specific wallet. Some companies want the flexibility of MetaMask — the freedom to swap or bridge through any DeFi protocol they choose. Others prioritize the custody and compliance posture of Circle Wallets. This protocol is built to serve either preference fully, not to push every company toward a single "correct" wallet choice.

### The problems this addresses

Manually running crypto payroll today means:

- **Slow settlement** — bank wires still take 2–5 days for international payroll, with FX conversion buried in an opaque process.
- **Misdirected payments** — copy-pasting each recipient address by hand invites a single mistyped character to send funds somewhere unrecoverable.
- **Unpredictable gas costs** — gas varies payment to payment with no forecasting built into a spreadsheet-driven process.
- **Manual tax reconciliation** — piecing together explorer links after the fact to prove what was actually paid, and at what FX rate.
- **Private key custody burden** — someone has to hold and protect a key capable of moving company funds.
- **The problem compounds with headcount** — the same copy-paste-and-verify cycle for every address and every amount repeats every pay period, and every repetition is another chance to make a mistake.

---


## 2. Why This Matters for Circle

This isn't just "a project that uses Circle Wallets." Payroll is one of the use cases where Circle's broader product stack — not just one API — is the *correct* infrastructure, not merely an available one.

- **No wallet extension, no seed phrase, no key-management headcount.** A finance department is unlikely to adopt an onboarding process that requires every employee to safely store a MetaMask seed phrase. Circle User-Controlled Wallets let a company provision a wallet when an employee signs in with Google. Users authorize transactions through Circle's OAuth and PIN-gated flow, without requiring browser extensions, seed phrases, or our application to hold a company-managed private key. That is the difference between a crypto-native workflow and one an HR department can realistically roll out.

- **Cross-border payroll *is* Circle's stablecoin FX thesis.** This protocol exists to pay international teams in the currency they actually want. We already ship USDC↔EURC auto-swap on execution today. Circle's stablecoin lineup (EURC live, and additional currencies expanding) plus **StableFX** — Circle's institutional on-chain FX venue built on Arc — is the natural settlement layer for exactly this problem. StableFX isn't integrated yet (still testnet-Curve for the swap step), but the architecture is built around "recipient picks a currency, protocol settles it" — so slotting in StableFX as the FX rail is a migration, not a redesign.

- **Recurring payment schedules are what Chainlink Automation was built for — and Chainlink is an Arc ecosystem partner.** Payroll is inherently "run this exact logic on a schedule, forever, without a human in the loop." Right now that job runs on a GitHub Actions cron because Automation isn't available on Arc Testnet yet, but that's explicitly a placeholder: moving execution to Chainlink Automation removes GitHub (and whoever holds that repo's secrets) as a trust and uptime dependency, and plugs into infrastructure that's already aligned with Arc.

- **Payroll is the use case that most needs opt-in privacy — and Arc's roadmap is heading there.** Companies want the speed and low fees of stablecoin rails, but salary amounts and org charts are exactly the kind of data nobody wants permanently public on a block explorer. As privacy-preserving payment features land on Arc mainnet, payroll is one of the clearest beneficiaries of that roadmap — and this protocol is architected so a privacy layer slots into the existing schedule/execute flow rather than requiring a rebuild.

In short: every major piece of this protocol — wallets, FX, scheduled execution, and (soon) privacy — has a purpose-built Circle or Arc-ecosystem answer that we're either already using or explicitly building toward.

---


## 3. Architecture

```
┌────────────┐  ┌───────┐  ┌───────────────────────┐
│  MetaMask  │  │ Privy │  │   Circle Wallets       │
│   (EOA)    │  │(embed)│  │ (Google OAuth + PIN)   │
└─────┬──────┘  └───┬───┘  └────────────┬───────────┘
      └──────────────┴───────────────────┘
                      │
      ┌───────────────▼────────────────┐   ┌────────────────────────┐
      │ Next.js Frontend (page.tsx)    │◄─►│ Circle Developer API   │
      │ wallet-agnostic UI              │   │ User Token/PIN auth     │
      └───────────────┬────────────────┘   │ contractExecution       │
                      │                     │ signTransaction         │
      ┌───────────────▼────────┐  ┌────────┴────────┐
      │ API Routes: circle-*,  │  │  Vercel KV       │
      │ record-execution,      │  │  (execution      │
      │ verified-report        │  │   history index) │
      └───────────────┬────────┘  └──────────────────┘
                      │
      ┌───────────────▼────────────────────────┐
      │ GitHub Actions (cron, every 6 hours)    │
      │ auto-execute.mjs → Registry.getAll()    │
      │ → executeSchedule() when due            │
      └───────────────┬────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────┐
│                Arc Testnet (5042002)                 │
│ PaymentScheduler.sol · Registry.sol · Curve Swap     │
│ (per-company)   (schedulerOf map)   (USDC⇄EURC)      │
│                                                       │
│ Registry.sol:        0xc01C0113e353c6Fc1bE7D32A80... │
│ PaymentScheduler.sol: 0x91b1F3B731cC7B6d8878e7D1A...  │
│ (example company deployment)                          │
└───────────────────────────────────────────────────────┘
```

### Automated Execution Trust Model

On Arc Testnet, a GitHub Actions cron job runs every six hours using a dedicated executor wallet. The executor triggers `executeSchedule()` for due payments across registered company schedulers, but it cannot create schedules, change recipients, modify payment amounts, alter intervals, manage whitelist entries, pause or resume schedules, or withdraw company funds.

Each company pre-approves its own PaymentScheduler contract to spend USDC through an ERC-20 allowance. The executor only triggers settlement according to the schedule data already stored on-chain; the recipient, amount, currency preference, cadence, and whitelist requirement are enforced by the company's immutable scheduler contract.

The executor private key is stored only as a GitHub Actions secret in the companion execution repository and is never exposed to the frontend or end users. For mainnet, this centralized testnet executor is designed to be replaced by Chainlink Automation, removing GitHub-hosted execution credentials from the settlement path.

### Key contracts

- **`PaymentScheduler.sol`** — Each company receives an isolated PaymentScheduler deployment. Within each scheduler, payroll state and authorization are scoped to `msg.sender`, so one wallet cannot modify another wallet's schedules or whitelist entries.
- **`Registry.sol`** — A single shared registry. `register(address scheduler, string name)` records a company's contract, and `schedulerOf(address owner)` allows any wallet (including a freshly-logged-in Circle wallet) to look up its own payroll contract without needing local storage.

---


## 4. Circle Integration Details

All Circle-specific logic lives in `app/api/circle-*` routes and `lib/circle/CircleWalletContext.tsx`.

| User action | Circle API used | Notes |
|---|---|---|
| Google login | `W3SSdk.performLogin(SocialLoginProvider.GOOGLE)` | Creates an EOA-type User-Controlled Wallet on first login |
| Deploy contract | Disposable backend wallet deploys; Circle wallet then signs `register()` via `contractExecution` | Arc Testnet does not support `to: null` contract-creation via Circle's `signTransaction` at this time |
| Add / remove whitelist entry | `contractExecution` with `abiFunctionSignature: "addToWhitelist(address)"` / `"removeFromWhitelist(address)"` | |
| Bulk CSV whitelist import | Sequential `contractExecution` calls, one PIN per entry | Circle does not currently support arbitrary Multicall-style batched parameters, so bulk import is sequential for Circle users (vs. a single Multicall3 tx for MetaMask/Privy) |
| Create schedule | Automatic allowance check → conditional `approve(address,uint256)` challenge → `createSchedule(...)` challenge | Two PIN prompts only when allowance is insufficient |
| Pause / resume schedule | `contractExecution` with `abiFunctionSignature: "toggleSchedule(uint256)"` | |
| USDC withdrawal | `contractExecution` with `abiFunctionSignature: "transfer(address,uint256)"` on the USDC contract | Includes 25% / 50% / 100% quick-select |

### A note on what didn't work (and why it's documented here)

We deliberately tried — and ruled out — several Circle API paths before landing on the above:

- `user/transactions/contractDeployment` — this endpoint is for **Developer-Controlled** wallets, not User-Controlled wallets, and returns 404 in this context.
- `user/sign/transaction` with `blockchain: "ARC-TESTNET"` — rejected as an unsupported chain for that endpoint.
- `user/sign/transaction` with `blockchain: "EVM-TESTNET"` — accepted, but the resulting wallet resolves to Ethereum Sepolia, causing a chain-ID mismatch when broadcasting to Arc.

This is why contract deployment for Circle users uses the disposable-wallet-plus-Registry-registration pattern described above: it keeps the *ownership record* on the Circle user's own address while working around a current gap in direct contract-deployment support for User-Controlled Wallets on Arc.

---


## 5. Stablecoin FX — Verifiable, Not Just Executed

Employees can opt to receive **EURC** instead of USDC. The contract routes the payment through a Curve StableSwap pool at execution time.

The naive approach — caching "paid X USDC → Y EURC" in a database — is not trustworthy for tax or audit purposes, since a database record can be edited by anyone with API access.

Instead, `/api/verified-report`:

1. Pulls the list of transaction hashes for a given owner from Vercel KV (used only as an index).
2. Re-fetches each transaction receipt directly from Arc RPC.
3. Decodes the `ScheduleExecuted` event and confirms `owner` / `recipient` / `amount` match the cached record — flagging any mismatch.
4. Decodes the ERC-20 `Transfer` events immediately before/after the Curve pool address to reconstruct the *actual* USDC-in and EURC-out amounts.
5. Computes `rate = eurcOut / usdcIn` from that on-chain data and includes it in a downloadable CSV.

If a cached entry can't be matched on-chain, it's excluded from the "verified" set and surfaced as a flagged/failed entry instead of silently trusted.

---


## 6. Feature List

- Multi-wallet login (MetaMask / Privy / Circle) with feature parity
- Contract deployment + Registry self-registration
- Whitelist management (single-address and CSV bulk import)
- Recurring payment schedules (weekly / bi-weekly / monthly / quarterly), USDC or EURC
- Automatic USDC allowance handling (approve-then-schedule in one user flow)
- Pause / resume individual schedules
- Automated execution via GitHub Actions cron (every 6 hours), iterating every company in the Registry
- USDC withdrawal with quick 25% / 50% / 100% selectors
- Persistent execution history (Vercel KV) that survives Arc Testnet's `eth_getLogs` 10,000-block query limit
- On-chain re-verified payroll reports with CSV export, including reconstructed FX rates for EURC payments

---


## 7. How to Use

The app has three tabs: **Setting**, **Create Schedule**, and **Dashboard**. Connect any of the three supported wallets first, then work through the tabs in order the first time you set up a company.

### Step 1 — Deploy your contract (Setting tab)

Click **Deploy My Payroll Contract**. This deploys a fresh, dedicated `PaymentScheduler` contract for your company and registers it under your wallet address in the shared `Registry` contract.

This contract is **immutable once deployed** — its bytecode cannot be changed afterward, and it has no admin/owner variable, so no one (including us) can reach into another company's data or drain funds beyond the USDC allowance your company explicitly grants it later. Every company gets its own isolated contract instance.

### Step 2 — Whitelist recipients (Setting tab)

Before any address can receive a scheduled payment, it must be added to your contract's whitelist. **A payment to a non-whitelisted address will revert on-chain** — this is an intentional safety rail against sending funds to the wrong address by mistake.

- For one or two people, use the **Add to Whitelist** field and enter a single address.
- For anyone onboarding more than a handful of employees, use **CSV Whitelist Import** instead — it's faster and batches into far fewer transactions.

CSV format for whitelist import:

```
Label,Address
Tanaka Yuki,0x83c4586C744832e4C66F3B58E773687fA8E64a09
Suzuki Ken,0x8811d50D2604B45a5390806e55DDb8cB769828e0
```

Already-whitelisted addresses in a CSV are automatically skipped, so it's safe to re-upload the same file later with new rows added.

### Step 3 — Create payment schedules (Create Schedule tab)

Fill in a recipient, amount, interval, optional start date, and currency (USDC or EURC — EURC is auto-swapped from USDC at execution time), then click **Create Schedule**.

For multiple employees with different amounts, currencies, or start dates, use **CSV Bulk Import** instead of the manual form. The system reads columns **in this exact order**:

```
Label,Address,Amount,Interval,Date,Currency
Satoshi Nakamoto,0xE72869F17B0B98353Cb1E6078Ae84ccb8a6fa097,2100,monthly,today,USDC
Vitalik Buterin,0xecc24b6f8cff498Bc21603FEA1b8A1cD60433f89,600,weekly,2026/7/16,EURC
```

- **Label** — free text (e.g. an employee name)
- **Address** — must already be whitelisted (Step 2)
- **Amount** — in USDC, e.g. `0.09`
- **Interval** — one of `weekly` / `bi-weekly` / `monthly` / `quarterly`
- **Date** — `today`, `tomorrow`, or an explicit `YYYY-MM-DD`
- **Currency** — `USDC` (default if omitted) or `EURC`

Every row can differ from every other row — different amounts, different currencies, different cadences, different start dates — and the whole file is processed in one pass.

### Step 4 — Monitor and manage (Dashboard tab)

The Dashboard shows every on-chain schedule for your connected wallet: recipient, label, amount, interval, and status. Each schedule has a **Pause / Resume** toggle — pausing stops future automatic execution without deleting the schedule, so you can temporarily suspend a payment (e.g. an employee on leave) and resume it later.

### Step 5 — Download a verified report (Dashboard tab)

Scroll to **Verified Payroll Report** and click **Generate Verified Report**. The app re-checks every past execution directly against Arc Testnet (not just a cached database) before including it, then click **Download CSV** to get a file with date, recipient, label, amount sent, EURC received (if applicable), the on-chain swap rate, and a direct ArcScan link for every payment — ready to hand to a tax preparer or auditor.

---


## 8. Running Locally

```bash
git clone https://github.com/ryo7400s-del/arc-payroll-ui.git
cd arc-payroll-ui
npm install

# .env.local
NEXT_PUBLIC_PRIVY_APP_ID=...
NEXT_PUBLIC_CIRCLE_APP_ID=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
CIRCLE_API_KEY=...
DEPLOY_PRIVATE_KEY=...        # disposable wallet used only for Circle-user contract deployment
RECORD_SECRET=...             # shared secret between GitHub Actions and /api/record-execution
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

npm run dev
```

The automated execution cron lives in a companion repository (`arc-payroll-core`) as a GitHub Actions workflow (`auto-execute.yml`) running `auto-execute.mjs` on a 6-hour schedule.

---


## 9. What's Next

- **Migrate FX from Curve to Circle's StableFX.** Our current USDC↔EURC swap runs through a testnet Curve pool as a proof of concept; StableFX is Circle's institutional-grade on-chain FX platform (PvP settlement, RFQ-based pricing, 10 currencies including JPYC) built on Arc — the natural production path for this exact use case.
- **A dedicated, wallet-app-style UI built purely around Circle User-Controlled Wallets** — simpler and more focused than a multi-wallet dashboard, for companies that standardize on Circle.
- **A batch-capable contract variant for Circle wallets**, so a bulk CSV import needs one PIN confirmation instead of one per row.
- **Two-step approval payments**: an employee proposes a schedule, and a finance approver signs off via an email or Telegram link before the first on-chain execution — without requiring any contract change to the existing PaymentScheduler.
- **Migrate scheduled execution from GitHub Actions cron to Chainlink Automation** for mainnet — removing a single point of failure/trust f
