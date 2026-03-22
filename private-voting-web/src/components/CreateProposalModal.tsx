'use client';

import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { X } from 'lucide-react';
import { deriveGlobalStatePDA, deriveProposalPDA } from '@/lib/solanaClient';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

interface CreateProposalModalProps {
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function CreateProposalModal({ onClose, onCreated }: CreateProposalModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [votingMins, setVotingMins] = useState('5');
  const [passThreshold, setPassThreshold] = useState('51');
  const [minVotes, setMinVotes] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const globalStatePDA = deriveGlobalStatePDA(PROGRAM_ID);

      // Read current proposal_count from GlobalState
      let gsInfo = await connection.getAccountInfo(globalStatePDA);
      if (!gsInfo) {
        // Initialize GlobalState if needed
        const initDisc = Buffer.from([232, 254, 209, 244, 123, 89, 154, 207]);
        const initIx = new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: globalStatePDA, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_ID,
          data: initDisc,
        });
        const initTx = new Transaction().add(initIx);
        const { blockhash: ib, lastValidBlockHeight: il } = await connection.getLatestBlockhash();
        initTx.recentBlockhash = ib;
        initTx.feePayer = publicKey;
        const initSig = await sendTransaction(initTx, connection);
        await connection.confirmTransaction({ signature: initSig, blockhash: ib, lastValidBlockHeight: il }, 'confirmed');
        gsInfo = await connection.getAccountInfo(globalStatePDA);
        if (!gsInfo) throw new Error('Failed to initialize GlobalState');
      }

      const proposalCount = gsInfo.data.readBigUInt64LE(8);
      const proposalPDA = deriveProposalPDA(PROGRAM_ID, proposalCount);

      // Discriminator for create_proposal
      const discriminator = Buffer.from([132, 116, 68, 174, 216, 160, 198, 22]);

      const titleBytes = Buffer.from(title, 'utf8');
      const descBytes = Buffer.from(description, 'utf8');

      const titleBuf = Buffer.alloc(4 + titleBytes.length);
      titleBuf.writeUInt32LE(titleBytes.length, 0);
      titleBytes.copy(titleBuf, 4);

      const descBuf = Buffer.alloc(4 + descBytes.length);
      descBuf.writeUInt32LE(descBytes.length, 0);
      descBytes.copy(descBuf, 4);

      const votingPeriodSecs = BigInt(parseInt(votingMins) * 60);
      const periodBuf = Buffer.alloc(8);
      periodBuf.writeBigInt64LE(votingPeriodSecs);

      const thresholdBuf = Buffer.alloc(1);
      thresholdBuf.writeUInt8(parseInt(passThreshold));

      const minVotesBuf = Buffer.alloc(4);
      minVotesBuf.writeUInt32LE(parseInt(minVotes));

      const data = Buffer.concat([discriminator, titleBuf, descBuf, periodBuf, thresholdBuf, minVotesBuf]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: globalStatePDA, isSigner: false, isWritable: true },
          { pubkey: proposalPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data,
      });

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const logs = sim.value.logs ?? [];
        const anchorError = logs.find(l => l.includes('Error Message:'));
        throw new Error(anchorError ?? logs.join('\n') ?? JSON.stringify(sim.value.err));
      }

      const sig = await sendTransaction(tx, connection);
      const result = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (result.value.err) throw new Error('Transaction failed: ' + JSON.stringify(result.value.err));

      await new Promise(r => setTimeout(r, 1500));
      await onCreated();
      onClose();
    } catch (err: any) {
      if (err?.message === 'Plugin Closed') return;
      setError(err?.message ?? 'Failed to create proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#111118] border border-violet-500/20 rounded-2xl p-6 w-full max-w-md space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-slate-100 font-semibold text-lg">Create Proposal</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={128}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
                placeholder="Proposal title"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={512}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none"
                placeholder="What are you proposing?"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Voting (mins)</label>
                <input
                  type="number"
                  value={votingMins}
                  onChange={(e) => setVotingMins(e.target.value)}
                  min="1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Pass %</label>
                <input
                  type="number"
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Min votes</label>
                <input
                  type="number"
                  value={minVotes}
                  onChange={(e) => setMinVotes(e.target.value)}
                  min="1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting}
                disabled={!publicKey || !title.trim()}
                className="flex-1"
              >
                Create Proposal
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
