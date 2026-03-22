# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

Monorepo with two independent projects:

```
private-voting/
├── private-voting-contract/   # Solana/Anchor smart contract + tests
└── private-voting-web/        # Next.js frontend
```

---

## Contract (`private-voting-contract/`)

### Commands

```bash
# Build
anchor build

# Test (long timeout — Arcium TEE roundtrips)
yarn test
# runs: ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts

# Format
yarn lint        # Prettier check
yarn lint:fix    # Prettier auto-fix

# Deploy upgrade to devnet
solana program write-buffer target/deploy/private_voting.so --url devnet --keypair ~/.config/solana/id.json
solana program deploy --program-id <PROGRAM_ID> --buffer <BUFFER> --url devnet --keypair ~/.config/solana/id.json
```

Toolchain: Rust 1.89.0 (see `rust-toolchain.toml`). Anchor 0.32.1, arcium-anchor 0.9.2.

### Source Layout

```
programs/private_voting/src/
├── lib.rs        # 11 instruction handlers
├── types.rs      # Account structs (GlobalState, DaoAccount, MemberAccount, ProposalAccount, VoteRecord, TallyResult)
├── contexts.rs   # Anchor account validation structs
├── constants.rs  # COMP_DEF_OFFSET_TALLY_VOTES and MAX_VOTERS
├── error.rs      # ErrorCode enum
└── events.rs     # Event definitions
encrypted-ixs/    # Arcium encrypted instruction definitions
```

### Instruction Flow

```
initialize_global_state / initialize_tally_result  (one-time setup)
create_dao → add_member → create_proposal
cast_vote   (up to MAX_VOTERS=5 per proposal; vote is encrypted)
mark_tally_pending  (transition Active → TallyPending after voting period ends)
tally_votes         (queue Arcium MPC computation)
tally_votes_callback (invoked by Arcium after TEE computation; stores yes/no/abstain)
finalize_proposal   (applies quorum + threshold logic → Passed/Failed)
```

Proposal status machine: `Active → TallyPending → TallyInProgress → Passed | Failed`

### Account PDAs

| Account | Seeds |
|---|---|
| GlobalState | `[b"global_state"]` |
| DaoAccount | `[b"dao", dao_id: u64 LE]` |
| MemberAccount | `[b"member", dao_pubkey, member_pubkey]` |
| ProposalAccount | `[b"proposal", dao_pubkey, proposal_id: u64 LE]` |
| VoteRecord | `[b"vote", proposal_pubkey, voter_pubkey]` |
| TallyResult | `[b"tally_result"]` — singleton |
| ArciumSignerAccount | `[b"ArciumSignerAccount"]` |

### Critical: Box large Arcium accounts

In Anchor 0.32.1, `Account<'info, T>` stores `T` directly on the BPF stack. MXEAccount, Cluster, and ComputationDefinitionAccount are large enough to overflow the 4096-byte frame limit. Always declare them as `Box<Account<'info, T>>` in contexts — see `TallyVotes` and `TallyVotesCallback` in `contexts.rs` for the correct pattern.

---

## Web App (`private-voting-web/`)

### Commands

```bash
npm run dev    # dev server (localhost:3000)
npm run build  # production build
npm run lint   # ESLint
```

### Architecture

**State**: Zustand store at `src/store/votingStore.ts`. Three views: `home` (DAOList), `dao` (DAODetail), `proposal` (ProposalDetail).

**Arcium integration** lives in `src/lib/arciumVotingUtils.ts`:
- `encryptVote()` — X25519 key exchange + RescueCipher encryption, uses `getMXEPublicKey()` from SDK
- `sendTallyTransaction()` — manually builds `tally_votes` instruction (discriminator + args) and submits

All Arcium/Solana PDA helpers come from `@arcium-hq/client@0.9.2` — do not re-implement manually:
`getMXEAccAddress`, `getMempoolAccAddress`, `getExecutingPoolAccAddress`, `getComputationAccAddress`, `getClusterAccAddress`, `getCompDefAccAddress`, `getCompDefAccOffset`, `getFeePoolAccAddress`, `getClockAccAddress`, `getArciumProgramId`.

**Account data parsing** in components (e.g. `ProposalDetail.tsx`, `DAODetail.tsx`) is done manually from raw bytes — no IDL-based deserialization in the web app. When adding fields, update the byte offset arithmetic carefully. Nonces are u128 (16 bytes LE); read both halves with `readBigUInt64LE`.

**Cluster offset**: 456 (hardcoded in `arciumVotingUtils.ts`, matches devnet MXE setup).

### Deployed Addresses (devnet)

| Name | Address |
|---|---|
| Program | `12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD` |
| MXE account | `H9fUKQrCMxuNLof4kJ4R1czxSFCgKiD73rdpsd2ZjDhv` |
| tally_result | `5cZZEksFBiusG6cwxZaK9UJydbC9VEWsDQQeAyZBx1hv` |
| comp_def (tally_votes_v3) | `FrKzUsi95yC53zjqR6wo3mA5LjBfBhXo662qFiiavXoF` |
| Arcium program | `Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ` |
| Upgrade authority | `CvRoNaBGYQtJS5cZ77S7D8Q86KL9pmpF2zvJE55WoiY2` |

### One-time devnet setup

After first deploy and any re-deploy that resets accounts:

```bash
node setup_devnet.mjs   # initializes tally_result + comp_def
```

Requires MXE to be initialized and finalized first:
```bash
arcium init-mxe --authority <wallet> --cluster-offset 456 --recovery-set-size 4
arcium finalize-mxe-keys <program_id> --cluster-offset 456
```
