import { Connection, PublicKey } from '@solana/web3.js';
import { ProposalAccount, VoteRecord, ProposalStatusString } from '@/types/voting';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require('bs58') as { encode: (buf: Uint8Array) => string };

// ─── Discriminator helpers ────────────────────────────────────────────────────

const DISCRIMINATORS = {
  ProposalAccount: Buffer.from([164, 190, 4, 248, 203, 124, 243, 64]),
  VoteRecord: Buffer.from([112, 9, 123, 165, 234, 9, 157, 167]),
  TallyResult: Buffer.from([189, 79, 74, 135, 150, 4, 4, 15]),
};

// ─── Parse status enum ────────────────────────────────────────────────────────

export function parseProposalStatus(status: any): ProposalStatusString {
  if (!status) return 'active';
  if ('active' in status) return 'active';
  if ('tallyPending' in status) return 'tallyPending';
  if ('tallyInProgress' in status) return 'tallyInProgress';
  if ('passed' in status) return 'passed';
  if ('failed' in status) return 'failed';
  return 'active';
}

// ─── Parse ProposalAccount from raw bytes ─────────────────────────────────────

export function parseProposalAccount(pubkey: PublicKey, data: Buffer): ProposalAccount {
  let off = 8; // skip discriminator

  const proposer = new PublicKey(data.slice(off, off + 32)).toBase58(); off += 32;
  const proposalId = data.readBigUInt64LE(off); off += 8;

  const titleLen = data.readUInt32LE(off); off += 4;
  const title = data.slice(off, off + titleLen).toString('utf8'); off += titleLen;

  const descLen = data.readUInt32LE(off); off += 4;
  const description = data.slice(off, off + descLen).toString('utf8'); off += descLen;

  const votingPeriodSecs = data.readBigInt64LE(off); off += 8;
  const passThreshold = data.readUInt8(off); off += 1;
  const minVotes = data.readUInt32LE(off); off += 4;

  const statusByte = data.readUInt8(off); off += 1;
  const statusMap: any[] = [
    { active: {} }, { tallyPending: {} }, { tallyInProgress: {} },
    { tallyComplete: {} }, { passed: {} }, { failed: {} },
  ];
  const status = statusMap[statusByte] ?? { active: {} };

  const voteStart = data.readBigInt64LE(off); off += 8;
  const voteEnd = data.readBigInt64LE(off); off += 8;
  const voteCount = data.readUInt8(off); off += 1;
  const yesCount = data.readUInt32LE(off); off += 4;
  const noCount = data.readUInt32LE(off); off += 4;
  const abstainCount = data.readUInt32LE(off); off += 4;
  const bump = data.readUInt8(off);

  return {
    publicKey: pubkey.toBase58(),
    proposer,
    proposalId,
    title,
    description,
    votingPeriodSecs,
    passThreshold,
    minVotes,
    status,
    voteStart,
    voteEnd,
    voteCount,
    yesCount,
    noCount,
    abstainCount,
    bump,
  };
}

// ─── Fetch all proposals ──────────────────────────────────────────────────────

export async function fetchAllProposals(
  connection: Connection,
  programId: PublicKey
): Promise<ProposalAccount[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(DISCRIMINATORS.ProposalAccount) } },
    ],
  });

  const results: ProposalAccount[] = [];
  for (const { pubkey, account } of accounts) {
    try {
      results.push(parseProposalAccount(pubkey, account.data as unknown as Buffer));
    } catch {
      // Skip accounts with incompatible layout (old proposals from before contract upgrade)
    }
  }
  return results.sort((a, b) => Number(b.proposalId - a.proposalId)); // newest first
}

// ─── Fetch vote records for a proposal ───────────────────────────────────────

export async function fetchVoteRecords(
  connection: Connection,
  programId: PublicKey,
  proposalPubkey: PublicKey
): Promise<VoteRecord[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(DISCRIMINATORS.VoteRecord) } },
      { memcmp: { offset: 8, bytes: proposalPubkey.toBase58() } },
    ],
  });

  return accounts.map(({ pubkey, account }) => {
    const d = account.data as unknown as Buffer;
    let off = 8 + 32; // disc + proposal
    const voter = new PublicKey(d.slice(off, off + 32)).toBase58(); off += 32;
    const encryptionPubkey = Array.from(d.slice(off, off + 32)); off += 32;
    const nonceLo = d.readBigUInt64LE(off);
    const nonceHi = d.readBigUInt64LE(off + 8);
    const nonce = nonceLo | (nonceHi << 64n); off += 16;
    const encryptedVote = Array.from(d.slice(off, off + 32)); off += 32;
    const votedAt = d.readBigInt64LE(off); off += 8;
    const bump = d.readUInt8(off);
    return {
      publicKey: pubkey.toBase58(),
      proposal: proposalPubkey.toBase58(),
      voter,
      encryptionPubkey,
      nonce,
      encryptedVote,
      votedAt,
      bump,
    };
  });
}

// ─── Derive PDAs ──────────────────────────────────────────────────────────────

export function deriveTallyResultPDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('tally_result')], programId)[0];
}

export function deriveVoteRecordPDA(
  programId: PublicKey,
  proposalPubkey: PublicKey,
  voterPubkey: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vote'), proposalPubkey.toBuffer(), voterPubkey.toBuffer()],
    programId
  )[0];
}

export function deriveGlobalStatePDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('global_state')], programId)[0];
}

export function deriveProposalPDA(programId: PublicKey, proposalId: bigint): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(proposalId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proposal'), idBuf],
    programId
  )[0];
}
