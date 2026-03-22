# PrivateVote — Privacy-Preserving DAO Governance on Solana

A decentralized governance platform where votes are **fully encrypted** before submission and tallied inside **Arcium's Trusted Execution Environment (TEE)** — only final aggregate results are ever published on-chain. No one, not even validators, can see how you voted.

---

## How It Works

1. **Connect** your Solana wallet (Phantom, Backpack, etc.)
2. **Browse proposals** — active, pending tally, or finalized
3. **Cast your vote** — Yes / No / Abstain — encrypted client-side before it ever leaves your browser
4. **Tally** — after voting ends, anyone can trigger the Arcium MPC computation
5. **Results** — only the aggregate counts (yes/no/abstain) are written on-chain; individual votes remain private forever

```
Vote encrypted in browser
        ↓
Stored on Solana (ciphertext only)
        ↓
Arcium TEE tallies in secure enclave
        ↓
Aggregate result published on-chain
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana (Devnet) |
| Smart Contract | Anchor 0.32.1 |
| Privacy Layer | Arcium TEE / MPC (arcium-anchor 0.9.2) |
| Encryption | X25519 key exchange + RescueCipher |
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Wallet | @solana/wallet-adapter |

---

## Features

- **Encrypted voting** — votes are encrypted with the MXE public key before submission
- **Private tally** — Arcium's TEE computes the result without seeing individual votes
- **DAO management** — create DAOs, add members, manage proposals
- **Proposer-only delete** — only the wallet that created a proposal can delete it
- **Real-time status** — Active → Awaiting Tally → Tallying → Passed / Failed

---

## Deployed Addresses (Devnet)

| Account | Address |
|---|---|
| Program | `12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD` |
| MXE Account | `H9fUKQrCMxuNLof4kJ4R1czxSFCgKiD73rdpsd2ZjDhv` |
| Tally Result | `5cZZEksFBiusG6cwxZaK9UJydbC9VEWsDQQeAyZBx1hv` |
| Comp Def | `7FnFXX4p6dvNrbiXXARZTJ2qY9gmWERVfBz4HzX5vkNR` |
| Arcium Program | `Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ` |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Solana wallet browser extension (Phantom recommended)
- Wallet funded with Devnet SOL (`solana airdrop 2`)

### Run Locally

```bash
git clone https://github.com/DuyVo96/private-voting-web
cd private-voting-web
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_PROGRAM_ID=12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

```bash
npm run dev
# → http://localhost:3000
```

---

## Live Demo

[private-voting-web.vercel.app](https://private-voting-web.vercel.app)

---

## Built By

[@HunterGuy102](https://x.com/HunterGuy102)
