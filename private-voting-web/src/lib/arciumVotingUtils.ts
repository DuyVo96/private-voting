import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  x25519,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
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
} from '@arcium-hq/client';
import { VoteChoice, VoteRecord, EncryptedVote } from '@/types/voting';

// ─── Constants ────────────────────────────────────────────────────────────────

const ARCIUM_PROG = getArciumProgramId();
const CLUSTER_OFFSET = 456; // active devnet cluster for our MXE

// Vote encoding
export const VOTE_YES     = 1;
export const VOTE_NO      = 0;
export const VOTE_ABSTAIN = 2;

// ─── PDA Helpers ─────────────────────────────────────────────────────────────

export function getMXEAddr(programId: PublicKey): PublicKey {
  return getMXEAccAddress(programId);
}

export function getCompDefPDA(programId: PublicKey): PublicKey {
  const compDefOffset = Buffer.from(getCompDefAccOffset('tally_votes_v4')).readUInt32LE(0);
  return getCompDefAccAddress(programId, compDefOffset);
}

// ─── MXE Public Key Reader ─────────────────────────────────────────────────

/**
 * Fetches the X25519 public key from the MXE account using the SDK.
 * Retries until the key is available (MXE finalized).
 */
async function getMXEX25519Key(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries = 10,
  retryDelayMs = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const key = await getMXEPublicKey(provider, programId);
      if (key !== null) return key;
    } catch (err) {
      console.warn(`getMXEPublicKey attempt ${attempt} failed:`, err);
    }
    if (attempt < maxRetries) await new Promise(r => setTimeout(r, retryDelayMs));
  }
  throw new Error('MXE X25519 key not available yet — try again in a few minutes');
}

// ─── Encrypt a vote ───────────────────────────────────────────────────────────

export async function encryptVote(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  vote: VoteChoice
): Promise<EncryptedVote> {
  const mxePublicKey = await getMXEX25519Key(provider, programId);

  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey  = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = new anchor.BN(deserializeLE(nonceBytes).toString());

  const encrypted = cipher.encrypt([BigInt(vote)], nonceBytes);
  const vote_ct = Array.from(encrypted[0]);

  return {
    enc_pubkey: Array.from(publicKey),
    nonce,
    vote_ct,
  };
}

// ─── Send TallyVotes transaction ──────────────────────────────────────────────

export async function sendTallyTransaction(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  proposalPubkey: PublicKey,
  voteRecords: VoteRecord[]
): Promise<string> {
  const payer = provider.wallet.publicKey;
  const MAX_VOTERS = 5;

  // Arcis eagerly decrypts all Enc<Shared, u8> slots regardless of count.
  // Zero-padded slots are invalid ciphertexts → ExecutionFailure::Inputs.
  // Fix: encrypt a dummy value (0) for each unused slot using real MXE key.
  const mxeKey = await getMXEX25519Key(provider, programId);

  const enc_pubkeys: number[][] = [];
  const nonces: anchor.BN[]    = [];
  const vote_cts: number[][]   = [];

  for (let i = 0; i < MAX_VOTERS; i++) {
    if (i < voteRecords.length) {
      const r = voteRecords[i];
      enc_pubkeys.push(Array.from(r.encryptionPubkey));
      nonces.push(new anchor.BN(r.nonce.toString()));
      vote_cts.push(Array.from(r.encryptedVote));
    } else {
      // Encrypt a dummy 0 so the TEE can decrypt it without failing
      const dummyPrivKey = x25519.utils.randomPrivateKey();
      const dummyPubKey  = x25519.getPublicKey(dummyPrivKey);
      const dummyShared  = x25519.getSharedSecret(dummyPrivKey, mxeKey);
      const dummyCipher  = new RescueCipher(dummyShared);
      const dummyNonceBytes = new Uint8Array(16);
      crypto.getRandomValues(dummyNonceBytes);
      const dummyNonce = new anchor.BN(deserializeLE(dummyNonceBytes).toString());
      const dummyCt    = dummyCipher.encrypt([BigInt(0)], dummyNonceBytes);
      enc_pubkeys.push(Array.from(dummyPubKey));
      nonces.push(dummyNonce);
      vote_cts.push(Array.from(dummyCt[0]));
    }
  }

  const computationOffsetBytes = new Uint8Array(8);
  crypto.getRandomValues(computationOffsetBytes);
  const computationOffset = new anchor.BN(deserializeLE(computationOffsetBytes).toString());

  const [signPdaPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('ArciumSignerAccount')],
    programId
  );
  const [tallyResultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('tally_result')],
    programId
  );

  // Use SDK helpers for Arcium PDAs
  const compDefOffset   = Buffer.from(getCompDefAccOffset('tally_votes_v4')).readUInt32LE(0);
  const mxeAccount      = getMXEAccAddress(programId);
  const mempoolAccount  = getMempoolAccAddress(CLUSTER_OFFSET);
  const executingPool   = getExecutingPoolAccAddress(CLUSTER_OFFSET);
  const computationAcct = getComputationAccAddress(CLUSTER_OFFSET, computationOffset);
  const compDefAccount  = getCompDefAccAddress(programId, compDefOffset);
  const clusterAccount  = getClusterAccAddress(CLUSTER_OFFSET);
  const POOL_ACCOUNT    = getFeePoolAccAddress();
  const CLOCK_ACCOUNT   = getClockAccAddress();

  const discriminator = Buffer.from([144, 82, 0, 72, 160, 132, 35, 121]);

  const computationOffsetBuf = computationOffset.toArrayLike(Buffer, 'le', 8);
  const actualCountBuf = Buffer.alloc(1);
  actualCountBuf.writeUInt8(voteRecords.length);

  const encPubkeysBuf = Buffer.concat(enc_pubkeys.map(k => Buffer.from(k)));
  const noncesBuf     = Buffer.concat(nonces.map(n => n.toArrayLike(Buffer, 'le', 16)));
  const voteCTsBuf    = Buffer.concat(vote_cts.map(ct => Buffer.from(ct)));

  const data = Buffer.concat([
    discriminator,
    computationOffsetBuf,
    actualCountBuf,
    encPubkeysBuf,
    noncesBuf,
    voteCTsBuf,
  ]);

  const keys = [
    { pubkey: payer,            isSigner: true,  isWritable: true  },
    { pubkey: signPdaPDA,       isSigner: false, isWritable: true  },
    { pubkey: mxeAccount,       isSigner: false, isWritable: false },
    { pubkey: mempoolAccount,   isSigner: false, isWritable: true  },
    { pubkey: executingPool,    isSigner: false, isWritable: true  },
    { pubkey: computationAcct,  isSigner: false, isWritable: true  },
    { pubkey: compDefAccount,   isSigner: false, isWritable: false },
    { pubkey: clusterAccount,   isSigner: false, isWritable: true  },
    { pubkey: POOL_ACCOUNT,     isSigner: false, isWritable: true  },
    { pubkey: CLOCK_ACCOUNT,    isSigner: false, isWritable: true  },
    { pubkey: proposalPubkey,   isSigner: false, isWritable: true  },
    { pubkey: tallyResultPDA,   isSigner: false, isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ARCIUM_PROG,      isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ keys, programId, data });
  const tx = new Transaction().add(ix);
  const { blockhash } = await provider.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  // Pre-simulate to surface the real error before opening wallet
  const sim = await provider.connection.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    console.error('tally_votes simulation logs:', logs);
    const anchorError = logs.find(l => l.includes('Error Message:'));
    throw new Error(anchorError ?? logs.join('\n') ?? JSON.stringify(sim.value.err));
  }

  const signed = await provider.wallet.signTransaction(tx);
  const sig = await provider.connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
    preflightCommitment: 'processed',
  });
  return sig;
}
