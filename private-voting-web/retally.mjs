/**
 * Reset stuck TallyInProgress proposals back to TallyPending,
 * then re-submit tally_votes with their actual vote records.
 *
 * Usage: node retally.mjs [proposalId1] [proposalId2] ...
 * Example: node retally.mjs 10 12
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getFeePoolAccAddress,
  getClockAccAddress,
  getArciumProgramId,
  getMXEPublicKey,
  x25519,
  RescueCipher,
  deserializeLE,
} from '@arcium-hq/client';
import BN from 'bn.js';

const connection  = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID  = new PublicKey('12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD');
const ARCIUM_PROG = getArciumProgramId();
const CLUSTER_OFFSET = 456;

const kp = JSON.parse(readFileSync('/Users/duy/.config/solana/id.json', 'utf8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(kp));
console.log('Payer:', payer.publicKey.toBase58());

// ─── Discriminators ───────────────────────────────────────────────────────────
const DISC_RESET_TALLY  = Buffer.from([133, 85, 212, 169, 75, 125, 102, 223]);
const DISC_TALLY_VOTES  = Buffer.from([144, 82, 0, 72, 160, 132, 35, 121]);

// ─── PDA helpers ─────────────────────────────────────────────────────────────
function proposalPDA(proposalId) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(proposalId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('proposal'), idBuf], PROGRAM_ID);
  return pda;
}

function voteRecordPDA(proposalPubkey, voterPubkey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vote'), proposalPubkey.toBuffer(), voterPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ─── Parse ProposalAccount data ───────────────────────────────────────────────
function parseProposal(data) {
  let off = 8 + 32 + 8; // disc + proposer + proposal_id
  const proposer = new PublicKey(data.slice(8, 40));
  const proposalId = data.readBigUInt64LE(40);
  const titleLen = data.readUInt32LE(off); off += 4;
  const title = data.slice(off, off + titleLen).toString(); off += titleLen;
  const descLen = data.readUInt32LE(off); off += 4;
  off += descLen;
  off += 8 + 1 + 4; // voting_period_secs + pass_threshold + min_votes
  const status = data[off]; off += 1;
  off += 8 + 8; // vote_start + vote_end
  const vote_count = data[off];
  const statusNames = ['Active','TallyPending','TallyInProgress','TallyComplete','Passed','Failed'];
  return { proposer, proposalId, title, status, statusName: statusNames[status] || status, vote_count };
}

// ─── Parse VoteRecord data ────────────────────────────────────────────────────
function parseVoteRecord(data) {
  let off = 8; // skip discriminator
  const proposal = new PublicKey(data.slice(off, off + 32)); off += 32;
  const voter = new PublicKey(data.slice(off, off + 32)); off += 32;
  const encPubkey = data.slice(off, off + 32); off += 32;
  // nonce: u128 = 16 bytes LE
  const nonceLo = data.readBigUInt64LE(off);
  const nonceHi = data.readBigUInt64LE(off + 8);
  const nonce = nonceLo | (nonceHi << 64n);
  off += 16;
  const encVote = data.slice(off, off + 32); off += 32;
  return { proposal, voter, encPubkey, nonce, encVote };
}

// ─── Fetch vote records for a proposal ───────────────────────────────────────
async function getVoteRecords(proposalPubkey) {
  // Get all program accounts with vote record discriminator
  const disc = createHash('sha256').update('account:VoteRecord').digest().slice(0, 8);
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: disc.toString('base64'), encoding: 'base64' } },
      { memcmp: { offset: 8, bytes: proposalPubkey.toBase58() } },
    ]
  });
  return accounts.map(a => ({ pubkey: a.pubkey, ...parseVoteRecord(a.account.data) }));
}

// ─── Get MXE X25519 key ───────────────────────────────────────────────────────
async function getMXEKey() {
  const mxeAcct = getMXEAccAddress(PROGRAM_ID);
  const info = await connection.getAccountInfo(mxeAcct);
  if (!info) throw new Error('MXE account not found');
  // x25519 pubkey is at offset: 8(disc) + cluster_option + 8+8+32 + auth_option + variant + ...
  // Easier: parse the struct similar to setup_devnet.mjs
  const d = info.data;
  let off = 8;
  const clusterSome = d[off]; off++;
  if (clusterSome === 1) off += 4;
  off += 8 + 8 + 32; // keygen_offset, key_recovery_init_offset, mxe_program_id
  const authSome = d[off]; off++;
  if (authSome === 1) off += 32;
  const variant = d[off]; off++;
  // x25519 pubkey is in utility_pubkeys.x25519 — first field
  const x25519Key = d.slice(off, off + 32);
  console.log('MXE x25519 key (first 8 bytes):', x25519Key.slice(0, 8).toString('hex'));
  return x25519Key;
}

// ─── Encrypt a dummy value for unused slots ───────────────────────────────────
function encryptDummy(mxeKey) {
  const privKey = x25519.utils.randomPrivateKey();
  const pubKey  = x25519.getPublicKey(privKey);
  const shared  = x25519.getSharedSecret(privKey, mxeKey);
  const cipher  = new RescueCipher(shared);
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = new BN(deserializeLE(nonceBytes).toString());
  const ct    = cipher.encrypt([0n], nonceBytes);
  return { pubKey: Array.from(pubKey), nonce, ct: Array.from(ct[0]) };
}

// ─── Reset a stuck proposal ───────────────────────────────────────────────────
async function resetTally(proposalId) {
  const proposal = proposalPDA(proposalId);
  console.log(`\nResetting proposal ${proposalId} (${proposal.toBase58().slice(0, 12)}...)`);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true,  isWritable: false },
      { pubkey: proposal,        isSigner: false, isWritable: true  },
    ],
    programId: PROGRAM_ID,
    data: DISC_RESET_TALLY,
  });
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    console.error('reset_tally simulation failed:', sim.value.logs?.join('\n'));
    throw new Error('reset_tally failed');
  }

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('✓ reset_tally confirmed:', sig);
  return sig;
}

// ─── Submit tally_votes ───────────────────────────────────────────────────────
async function tallyVotes(proposalId, voteRecords, mxeKey) {
  const proposal = proposalPDA(proposalId);
  console.log(`\nTallying proposal ${proposalId} with ${voteRecords.length} real vote(s)`);

  const MAX_VOTERS = 5;
  const enc_pubkeys = [];
  const nonces = [];
  const vote_cts = [];

  for (let i = 0; i < MAX_VOTERS; i++) {
    if (i < voteRecords.length) {
      const r = voteRecords[i];
      enc_pubkeys.push(Array.from(r.encPubkey));
      nonces.push(new BN(r.nonce.toString()));
      vote_cts.push(Array.from(r.encVote));
    } else {
      const dummy = encryptDummy(mxeKey);
      enc_pubkeys.push(dummy.pubKey);
      nonces.push(dummy.nonce);
      vote_cts.push(dummy.ct);
    }
  }

  const computationOffsetBytes = new Uint8Array(8);
  crypto.getRandomValues(computationOffsetBytes);
  const computationOffset = new BN(deserializeLE(computationOffsetBytes).toString());

  const [signPdaPDA] = PublicKey.findProgramAddressSync([Buffer.from('ArciumSignerAccount')], PROGRAM_ID);
  const [tallyResultPDA] = PublicKey.findProgramAddressSync([Buffer.from('tally_result')], PROGRAM_ID);

  const compDefOffset   = Buffer.from(getCompDefAccOffset('tally_votes_v4')).readUInt32LE(0);
  const mxeAccount      = getMXEAccAddress(PROGRAM_ID);
  const mempoolAccount  = getMempoolAccAddress(CLUSTER_OFFSET);
  const executingPool   = getExecutingPoolAccAddress(CLUSTER_OFFSET);
  const computationAcct = getComputationAccAddress(CLUSTER_OFFSET, computationOffset);
  const compDefAccount  = getCompDefAccAddress(PROGRAM_ID, compDefOffset);
  const clusterAccount  = getClusterAccAddress(CLUSTER_OFFSET);
  const POOL_ACCOUNT    = getFeePoolAccAddress();
  const CLOCK_ACCOUNT   = getClockAccAddress();

  const computationOffsetBuf = computationOffset.toArrayLike(Buffer, 'le', 8);
  const actualCountBuf = Buffer.alloc(1);
  actualCountBuf.writeUInt8(voteRecords.length);

  const encPubkeysBuf = Buffer.concat(enc_pubkeys.map(k => Buffer.from(k)));
  const noncesBuf     = Buffer.concat(nonces.map(n => n.toArrayLike(Buffer, 'le', 16)));
  const voteCTsBuf    = Buffer.concat(vote_cts.map(ct => Buffer.from(ct)));

  const data = Buffer.concat([
    DISC_TALLY_VOTES,
    computationOffsetBuf,
    actualCountBuf,
    encPubkeysBuf,
    noncesBuf,
    voteCTsBuf,
  ]);

  const keys = [
    { pubkey: payer.publicKey,  isSigner: true,  isWritable: true  },
    { pubkey: signPdaPDA,       isSigner: false, isWritable: true  },
    { pubkey: mxeAccount,       isSigner: false, isWritable: false },
    { pubkey: mempoolAccount,   isSigner: false, isWritable: true  },
    { pubkey: executingPool,    isSigner: false, isWritable: true  },
    { pubkey: computationAcct,  isSigner: false, isWritable: true  },
    { pubkey: compDefAccount,   isSigner: false, isWritable: false },
    { pubkey: clusterAccount,   isSigner: false, isWritable: true  },
    { pubkey: POOL_ACCOUNT,     isSigner: false, isWritable: true  },
    { pubkey: CLOCK_ACCOUNT,    isSigner: false, isWritable: true  },
    { pubkey: proposal,         isSigner: false, isWritable: true  },
    { pubkey: tallyResultPDA,   isSigner: false, isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ARCIUM_PROG,      isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    console.error('tally_votes simulation failed:', logs.join('\n'));
    throw new Error('tally_votes simulation failed');
  }

  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('✓ tally_votes confirmed:', sig);
  console.log('  Waiting for Arcium callback...');
  return sig;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const proposalIds = process.argv.slice(2).map(Number);
if (proposalIds.length === 0) {
  console.error('Usage: node retally.mjs <proposalId1> [proposalId2] ...');
  process.exit(1);
}

const mxeKey = await getMXEKey();
console.log('MXE key fetched OK');

for (const id of proposalIds) {
  const pda = proposalPDA(id);
  const info = await connection.getAccountInfo(pda);
  if (!info) { console.error(`Proposal ${id} not found`); continue; }
  const p = parseProposal(info.data);
  console.log(`\nProposal ${id}: "${p.title}" | status=${p.statusName} | votes=${p.vote_count}`);

  if (p.statusName === 'TallyInProgress') {
    await resetTally(id);
  } else if (p.statusName !== 'TallyPending') {
    console.log('Not in TallyPending or TallyInProgress, skipping');
    continue;
  }

  // Fetch vote records
  const voteRecords = await getVoteRecords(pda);
  console.log(`Found ${voteRecords.length} vote record(s)`);
  for (const v of voteRecords) {
    console.log('  voter:', v.voter.toBase58().slice(0, 12), 'encPubkey:', Buffer.from(v.encPubkey).toString('hex').slice(0, 16));
  }

  await tallyVotes(id, voteRecords, mxeKey);
}

console.log('\nDone. Arcium TEE will call back within a few minutes.');
