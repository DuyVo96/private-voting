/**
 * One-time setup script for private-voting on devnet.
 * Calls:
 *   1. initialize_tally_result  (our program)
 *   2. init_tally_comp_def      (our program → CPI to old Arcium)
 *
 * Run from: /Users/duy/Desktop/Arcium/private-voting/private-voting-web
 *   node /tmp/setup_devnet.mjs
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const connection  = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID  = new PublicKey('12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD');
const ARCIUM_PROG = new PublicKey('Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ');
const LUT_PROG    = new PublicKey('AddressLookupTab1e1111111111111111111111111');

// Load payer keypair
const kp = JSON.parse(readFileSync('/Users/duy/.config/solana/id.json', 'utf8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(kp));
console.log('Payer:', payer.publicKey.toBase58());

// ─── PDA helpers ─────────────────────────────────────────────────────────────

// After fix: mxe = PDA([b"MXEAccount", OUR_PROG.to_bytes()], ARCIUM)
const [mxeAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from('MXEAccount'), PROGRAM_ID.toBuffer()], ARCIUM_PROG
);

// compDef: derive_comp_def_pda uses crate::ID_CONST = OUR_PROG as the seed (after fix)
// PDA([b"ComputationDefinitionAccount", OUR_PROG.to_bytes(), sha256("tally_votes")[0..4]], Arcj82)
const compDefOffsetBytes = createHash('sha256').update('tally_votes_v4').digest().slice(0, 4);
const [compDefAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from('ComputationDefinitionAccount'), PROGRAM_ID.toBuffer(), compDefOffsetBytes],
  ARCIUM_PROG
);

const [tallyResultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('tally_result')], PROGRAM_ID
);

// LUT: derive_mxe_lut_pda uses lut_offset_slot from MXE account data
// We read it below after confirming the MXE exists
console.log('mxe_account:', mxeAccount.toBase58());
console.log('comp_def_account:', compDefAccount.toBase58());
console.log('tally_result PDA:', tallyResultPDA.toBase58());

// ─── Read MXE lut_offset_slot ──────────────────────────────────────────────
async function getLutAddress() {
  const info = await connection.getAccountInfo(mxeAccount);
  if (!info) throw new Error('MXE account not found at ' + mxeAccount.toBase58());
  const d = info.data;
  let off = 8;
  const clusterSome = d[off]; off++;
  if (clusterSome === 1) off += 4;
  off += 8 + 8 + 32; // keygen_offset, key_recovery_init_offset, mxe_program_id
  const authSome = d[off]; off++;
  if (authSome === 1) off += 32;
  const variant = d[off]; off++;
  off += 32 + 32 + 32 + 64; // utility_pubkeys (x25519, ed, bn_pub)
  if (variant === 1) {
    const vecLen = d.readUInt32LE(off); off += 4;
    off += vecLen;
  }
  const lutOffsetSlot = d.readBigUInt64LE(off);
  console.log('lut_offset_slot:', lutOffsetSlot.toString());
  const slotBuf = Buffer.alloc(8);
  slotBuf.writeBigUInt64LE(lutOffsetSlot);
  const [lutAddr] = PublicKey.findProgramAddressSync([mxeAccount.toBuffer(), slotBuf], LUT_PROG);
  console.log('lut_address:', lutAddr.toBase58());
  return lutAddr;
}

// ─── Check what already exists ───────────────────────────────────────────────
const [trInfo, cdInfo] = await Promise.all([
  connection.getAccountInfo(tallyResultPDA),
  connection.getAccountInfo(compDefAccount),
]);
console.log('\ntally_result exists:', trInfo !== null);
console.log('comp_def exists:', cdInfo !== null);

// ─── Step 1: initialize_tally_result ─────────────────────────────────────────
async function initTallyResult() {
  console.log('\n→ initialize_tally_result ...');
  const disc = Buffer.from([156, 55, 198, 90, 201, 195, 154, 214]);
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: tallyResultPDA,     isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: disc,
  });
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    console.error('Simulation failed:', sim.value.logs?.join('\n'));
    throw new Error('initialize_tally_result simulation failed');
  }

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('✓ tally_result initialized:', sig);
}

// ─── Step 2: init_tally_comp_def ─────────────────────────────────────────────
async function initTallyCompDef() {
  console.log('\n→ init_tally_comp_def ...');
  const lutAddress = await getLutAddress();
  const disc = Buffer.from([45, 146, 189, 232, 173, 158, 176, 227]);
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: mxeAccount,         isSigner: false, isWritable: true  },
      { pubkey: compDefAccount,     isSigner: false, isWritable: true  },
      { pubkey: lutAddress,         isSigner: false, isWritable: true  },
      { pubkey: LUT_PROG,           isSigner: false, isWritable: false },
      { pubkey: ARCIUM_PROG,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: disc,
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    console.error('Simulation failed:', sim.value.logs?.join('\n'));
    throw new Error('init_tally_comp_def simulation failed');
  }

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('✓ comp_def initialized:', sig);
}

// ─── Run ─────────────────────────────────────────────────────────────────────
if (!trInfo) {
  await initTallyResult();
} else {
  console.log('→ tally_result already initialized, skipping');
}

if (!cdInfo) {
  await initTallyCompDef();
} else {
  console.log('→ comp_def already initialized, skipping');
}

console.log('\n✓ Setup complete');
