# PrivateVote — Privacy-Preserving DAO Governance on Solana

A decentralized governance platform where votes are **fully encrypted** before submission and tallied inside **Arcium's Trusted Execution Environment (TEE)** — only final aggregate results are ever published on-chain. No one, not even validators, can see how you voted.

**Live Demo:** [private-voting-web.vercel.app](https://private-voting-web.vercel.app)

---

## How Arcium is Used

### The Problem with Naive On-Chain Voting

In standard on-chain governance, every vote is stored as plaintext on the blockchain. This means:
- Anyone can see how each wallet voted in real time
- Voters are influenced by how others are voting (herding effect)
- Large token holders can be targeted or pressured based on their voting history
- There is no meaningful ballot privacy

### How PrivateVote Solves This with Arcium

Arcium provides a **Multi-Party Computation (MPC) network backed by Trusted Execution Environments (TEEs)**. This allows computation over encrypted data — the inputs remain private, but the output (aggregate tally) is provably correct.

#### Step-by-Step Integration

**1. Vote Encryption (Client-side)**

Before a vote ever leaves the browser, it is encrypted using **X25519 key exchange + RescueCipher**:

```typescript
// arciumVotingUtils.ts
const mxePublicKey = await getMXEPublicKey(provider, programId);
// X25519 key exchange with MXE public key
// RescueCipher encrypts the vote value (0=No, 1=Yes, 2=Abstain)
// Nonce is generated per-vote to prevent replay attacks
```

The encrypted vote and nonce are stored on-chain inside `VoteRecord` — the plaintext vote value is never written anywhere.

**2. On-Chain Vote Storage**

The `cast_vote` instruction stores only ciphertext:
```rust
// types.rs
pub struct VoteRecord {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub encrypted_vote: [u64; 4],  // ciphertext — never decryptable without MXE
    pub nonce: u128,
}
```

**3. Tally via Arcium MPC (tally_votes instruction)**

After the voting period ends, the `tally_votes` instruction queues an **Arcium MPC computation**:

```rust
// lib.rs — tally_votes instruction
arcium_cpi::queue_computation(
    computation_accounts,
    vec![encrypted_vote_1, encrypted_vote_2, ...],
    COMP_DEF_OFFSET_TALLY_VOTES,
)?;
```

This submits all encrypted votes to Arcium's cluster. The circuit (`tally_votes_v4.arcis`) runs inside a TEE and computes `sum(yes)`, `sum(no)`, `sum(abstain)` without ever decrypting individual votes.

**4. Callback with Aggregate Results**

Arcium calls back `tally_votes_callback` on-chain with the plaintext aggregate:

```rust
// lib.rs — tally_votes_callback
pub fn tally_votes_callback(ctx: Context<TallyVotesV4Callback>, output: Vec<u8>) -> Result<()> {
    // output contains only: yes_count, no_count, abstain_count
    // individual votes remain encrypted forever
    tally_result.yes = yes_count;
    tally_result.no = no_count;
    tally_result.abstain = abstain_count;
}
```

**5. Finalization**

`finalize_proposal` reads the tally result and applies quorum + threshold logic to mark the proposal as Passed or Failed.

#### Privacy Guarantees

| Property | Value |
|---|---|
| Individual vote visibility | ❌ Never revealed |
| Tally correctness | ✅ Provable via TEE attestation |
| Voter coercion resistance | ✅ No one can verify how you voted |
| On-chain footprint | Encrypted ciphertext only |
| Who can read results | Anyone — only aggregates |

#### Arcium SDK Usage

The integration uses `@arcium-hq/client@0.9.2` and `arcium-anchor@0.9.2`:

```typescript
import {
  getMXEPublicKey,        // fetch MXE X25519 public key for encryption
  getMXEAccAddress,       // PDA for MXE account
  getCompDefAccAddress,   // PDA for computation definition
  getComputationAccAddress, // PDA for active computation
  getClusterAccAddress,   // PDA for Arcium cluster
  getMempoolAccAddress,   // PDA for mempool
  getExecutingPoolAccAddress, // PDA for execution pool
} from '@arcium-hq/client';
```

---

## How It Works (User Flow)

1. **Connect** your Solana wallet (Phantom, Backpack, etc.)
2. **Browse proposals** — active, pending tally, or finalized
3. **Cast your vote** — Yes / No / Abstain — encrypted client-side before it ever leaves your browser
4. **Tally** — after voting ends, anyone can trigger the Arcium MPC computation
5. **Results** — only the aggregate counts (yes/no/abstain) are written on-chain; individual votes remain private forever

```
Vote encrypted in browser  (X25519 + RescueCipher)
           ↓
Ciphertext stored on Solana  (VoteRecord account)
           ↓
Arcium TEE tallies inside secure enclave  (tally_votes circuit)
           ↓
Aggregate result published on-chain  (yes / no / abstain counts only)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana (Devnet) |
| Smart Contract | Anchor 0.32.1 |
| Privacy Layer | Arcium TEE / MPC (`arcium-anchor 0.9.2`) |
| Encryption | X25519 key exchange + RescueCipher |
| Circuit | Custom `.arcis` circuit (`tally_votes_v4`) |
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Wallet | `@solana/wallet-adapter` |

---

## Project Structure

```
private-voting/
├── private-voting-contract/       # Solana/Anchor smart contract
│   ├── programs/private_voting/
│   │   └── src/
│   │       ├── lib.rs             # 11 instruction handlers
│   │       ├── types.rs           # Account structs
│   │       ├── contexts.rs        # Anchor account validation
│   │       ├── constants.rs       # Computation definition offset
│   │       └── error.rs           # Custom errors
│   ├── encrypted-ixs/             # Arcium encrypted instruction definitions
│   └── build/                     # Compiled Arcium circuit artifacts
│       └── tally_votes_v4.*
└── private-voting-web/            # Next.js frontend
    └── src/
        ├── lib/arciumVotingUtils.ts  # Encryption + tally transaction logic
        ├── components/               # UI components
        └── store/votingStore.ts      # Zustand state
```

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
git clone https://github.com/DuyVo96/private-voting
cd private-voting/private-voting-web
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

## Built By

[@HunterGuy102](https://x.com/HunterGuy102)
