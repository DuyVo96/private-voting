'use client';

import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { motion, AnimatePresence } from 'framer-motion';
import { ProposalAccount, VoteChoice } from '@/types/voting';
import { encryptVote } from '@/lib/arciumVotingUtils';
import { deriveVoteRecordPDA } from '@/lib/solanaClient';
import { useVotingStore } from '@/store/votingStore';
import { Button } from './ui/Button';
import { Shield, CheckCircle, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

interface VotingPanelProps {
  proposal: ProposalAccount;
  hasVoted: boolean;
  onVoteCast: () => void;
}

const choices: { value: VoteChoice; label: string; icon: React.ReactNode; variant: any }[] = [
  { value: 1, label: 'For', icon: <ThumbsUp className="w-5 h-5" />, variant: 'yes' },
  { value: 0, label: 'Against', icon: <ThumbsDown className="w-5 h-5" />, variant: 'no' },
  { value: 2, label: 'Abstain', icon: <Minus className="w-5 h-5" />, variant: 'abstain' },
];

export function VotingPanel({ proposal, hasVoted, onVoteCast }: VotingPanelProps) {
  const { publicKey, sendTransaction, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { setVoting } = useVotingStore();

  const [selected, setSelected] = useState<VoteChoice | null>(null);
  const [phase, setPhase] = useState<'idle' | 'encrypting' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (hasVoted) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
        <CheckCircle className="w-4 h-4" />
        Your encrypted vote has been recorded.
      </div>
    );
  }

  const handleVote = async () => {
    if (selected === null || !publicKey) return;
    setError(null);
    setVoting(true);

    try {
      const walletAdapter = {
        publicKey: publicKey!,
        signTransaction: signTransaction!,
        signAllTransactions: signAllTransactions!,
      };
      const provider = new anchor.AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' });

      setPhase('encrypting');
      const encVote = await encryptVote(provider, PROGRAM_ID, selected);

      setPhase('sending');

      const proposalPubkey = new PublicKey(proposal.publicKey);
      const voteRecordPDA = deriveVoteRecordPDA(PROGRAM_ID, proposalPubkey, publicKey);

      // Discriminator for cast_vote
      const discriminator = Buffer.from([20, 212, 15, 189, 69, 180, 69, 151]);
      const nonceBuffer = Buffer.alloc(16);
      const nonceBytes = encVote.nonce.toArray('le', 16);
      nonceBytes.forEach((b: number, i: number) => nonceBuffer.writeUInt8(b, i));

      const data = Buffer.concat([
        discriminator,
        proposalPubkey.toBuffer(),
        Buffer.from(encVote.enc_pubkey),
        nonceBuffer,
        Buffer.from(encVote.vote_ct),
      ]);

      const { Transaction, TransactionInstruction, SystemProgram } = await import('@solana/web3.js');
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: proposalPubkey, isSigner: false, isWritable: true },
          { pubkey: voteRecordPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data,
      });

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

      setPhase('done');
      setTimeout(() => {
        setPhase('idle');
        onVoteCast();
      }, 2000);
    } catch (err: any) {
      if (err?.message === 'Plugin Closed') { setPhase('idle'); return; }
      setError(err?.message ?? 'Failed to submit vote');
      setPhase('idle');
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {phase === 'encrypting' && (
          <motion.div
            key="encrypting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm"
          >
            <Shield className="w-5 h-5 animate-pulse" />
            Encrypting your vote with Arcium...
          </motion.div>
        )}

        {phase === 'sending' && (
          <motion.div
            key="sending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm"
          >
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Submitting encrypted vote to Solana...
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm"
          >
            <CheckCircle className="w-5 h-5" />
            Vote submitted! Your choice remains private.
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'idle' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {choices.map(({ value, label, icon, variant }) => (
              <button
                key={value}
                onClick={() => setSelected(value)}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium
                  transition-all duration-150
                  ${
                    selected === value
                      ? variant === 'yes'
                        ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                        : variant === 'no'
                        ? 'bg-red-600/20 border-red-500/50 text-red-300'
                        : 'bg-slate-600/30 border-slate-500/50 text-slate-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                  }
                `}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <Button
            onClick={handleVote}
            disabled={selected === null || !publicKey || phase !== 'idle'}
            className="w-full"
          >
            <Shield className="w-4 h-4" />
            Submit Private Vote
          </Button>

          <p className="text-xs text-slate-600 text-center">
            Your vote is encrypted before leaving your device. No one can see what you chose.
          </p>
        </>
      )}
    </div>
  );
}
