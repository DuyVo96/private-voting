/**
 * Uploads the tally_votes circuit and finalizes the comp def on devnet.
 * Run after init_tally_comp_def if comp def was never finalized.
 *
 *   node finalize_comp_def.mjs
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { uploadCircuit } from '@arcium-hq/client';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD');

const kp = JSON.parse(readFileSync('/Users/duy/.config/solana/id.json', 'utf8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(kp));
console.log('Payer:', payer.publicKey.toBase58());

const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: 'confirmed' });

const rawCircuit = readFileSync('../private-voting-contract/build/tally_votes.arcis');
console.log('Circuit size:', rawCircuit.length, 'bytes');

console.log('Uploading circuit and finalizing comp def...');
// chunkSize=5 to avoid 429s on public devnet RPC
const sigs = await uploadCircuit(provider, 'tally_votes', PROGRAM_ID, rawCircuit, true, 5);
console.log('✓ Done. Signatures:', sigs);
