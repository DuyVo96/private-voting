'use client';

import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { motion } from 'framer-motion';
import { ProposalAccount, VoteRecord } from '@/types/voting';
import { sendTallyTransaction } from '@/lib/arciumVotingUtils';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require('bs58') as { encode: (buf: Uint8Array) => string };
import { useVotingStore } from '@/store/votingStore';
import { Button } from './ui/Button';
import { Lock, Cpu } from 'lucide-react';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

interface TallyPanelProps {
  proposal: ProposalAccount;
  voteRecords: VoteRecord[];
  onTallyTriggered: () => void;
}

export function TallyPanel({ proposal, voteRecords, onTallyTriggered }: TallyPanelProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { setTallying } = useVotingStore();
  const [phase, setPhase] = useState<'idle' | 'sending' | 'waiting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleTally = async () => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected or does not support signing');
      return;
    }
    setError(null);
    setTallying(true);
    setPhase('sending');

    try {
      const walletAdapter = {
        publicKey,
        signTransaction,
        signAllTransactions: async (txs: any[]) => Promise.all(txs.map(t => signTransaction(t))),
      };
      const provider = new anchor.AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' });

      const proposalPubkey = new PublicKey(proposal.publicKey);

      // Step 1: mark_tally_pending — transitions Active → TallyPending
      // Pre-simulate first so we never open the wallet if already TallyPending (6004)
      const markDisc = Buffer.from([73, 205, 40, 139, 246, 229, 5, 168]);
      const markIx = new TransactionInstruction({
        keys: [
          { pubkey: publicKey!, isSigner: true, isWritable: true },
          { pubkey: proposalPubkey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: markDisc,
      });
      const markTx = new Transaction();
      const { blockhash: mBh, lastValidBlockHeight: mLvbh } = await connection.getLatestBlockhash();
      markTx.recentBlockhash = mBh;
      markTx.feePayer = publicKey!;
      markTx.add(markIx);

      const markSim = await connection.simulateTransaction(markTx);
      const markSimLogs = markSim.value.logs ?? [];
      const alreadyTallyPending = markSimLogs.some(l => l.includes('6004') || l.includes('0x1774') || l.includes('VotingNotActive'));

      if (markSim.value.err && !alreadyTallyPending) {
        const anchorErr = markSimLogs.find(l => l.includes('Error Message:'));
        throw new Error(anchorErr ?? markSimLogs.join('\n') ?? JSON.stringify(markSim.value.err));
      }

      if (!markSim.value.err) {
        const signedMark = await signTransaction!(markTx);
        const markSig = await connection.sendRawTransaction(signedMark.serialize());
        await connection.confirmTransaction({ signature: markSig, blockhash: mBh, lastValidBlockHeight: mLvbh }, 'confirmed');
      }
      // else: already TallyPending on-chain — skip mark_tally_pending, proceed to tally_votes

      // Step 2: fetch vote records fresh from chain (don't rely on stale prop)
      const VOTE_RECORD_DISC = Buffer.from([112, 9, 123, 165, 234, 9, 157, 167]);
      const vrAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode(VOTE_RECORD_DISC) } },
          { memcmp: { offset: 8, bytes: proposalPubkey.toBase58() } },
        ],
      });
      const freshVoteRecords: VoteRecord[] = vrAccounts.map(({ pubkey, account }) => {
        const d = account.data;
        let off = 8 + 32; // disc + proposal
        const voter = new PublicKey(d.slice(off, off + 32)).toBase58(); off += 32;
        const encryptionPubkey = Array.from(d.slice(off, off + 32)); off += 32;
        const nonceLo = d.readBigUInt64LE(off);
        const nonceHi = d.readBigUInt64LE(off + 8);
        const nonce = nonceLo | (nonceHi << 64n); off += 16;
        const encryptedVote = Array.from(d.slice(off, off + 32)); off += 32;
        const votedAt = d.readBigInt64LE(off); off += 8;
        const bump = d.readUInt8(off);
        return { publicKey: pubkey.toBase58(), proposal: proposalPubkey.toBase58(), voter, encryptionPubkey, nonce, encryptedVote, votedAt, bump };
      });
      if (freshVoteRecords.length === 0) throw new Error('No vote records found on-chain for this proposal');

      // Step 3: tally_votes — queue the Arcium MPC computation
      const sig = await sendTallyTransaction(provider, PROGRAM_ID, proposalPubkey, freshVoteRecords);
      console.log('Tally tx:', sig);

      setPhase('waiting');
      // Poll every 3s for up to 5 minutes for status change
      const maxAttempts = 100;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        // The parent component will refresh and update via onTallyTriggered
      }
      setPhase('done');
      onTallyTriggered();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to trigger tally');
      setPhase('idle');
    } finally {
      setTallying(false);
    }
  };

  if (phase === 'waiting') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20"
      >
        <div className="flex items-center gap-3 text-blue-300">
          <Cpu className="w-5 h-5 animate-pulse" />
          <div>
            <p className="font-medium text-sm">Arcium is tallying votes inside TEE...</p>
            <p className="text-xs text-blue-400/70 mt-0.5">
              Votes are being decrypted and counted in a Trusted Execution Environment.
              Results will appear once the computation completes.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onTallyTriggered} className="w-full">
          Check for results
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/30 space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Lock className="w-4 h-4 text-violet-400" />
          <span className="font-medium">Voting has ended</span>
        </div>
        <p className="text-xs text-slate-500">
          {voteRecords.length} vote{voteRecords.length !== 1 ? 's' : ''} cast. Results are
          hidden until the private tally computation completes.
        </p>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <Button
        onClick={handleTally}
        isLoading={phase === 'sending'}
        disabled={!publicKey || phase !== 'idle'}
        className="w-full"
      >
        <Cpu className="w-4 h-4" />
        Trigger Private Tally
      </Button>

      <p className="text-xs text-slate-600 text-center">
        This sends all encrypted votes to Arcium. The TEE tallies them without revealing
        individual choices.
      </p>
    </div>
  );
}
