'use client';

import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { X } from 'lucide-react';
import { deriveGlobalStatePDA } from '@/lib/solanaClient';
import * as anchor from '@coral-xyz/anchor';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

interface CreateDAOModalProps {
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function CreateDAOModal({ onClose, onCreated }: CreateDAOModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quorum, setQuorum] = useState('20');
  const [threshold, setThreshold] = useState('51');
  const [votingDays, setVotingDays] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const globalStatePDA = deriveGlobalStatePDA(PROGRAM_ID);

      // Initialize GlobalState if it doesn't exist yet
      let gsInfo = await connection.getAccountInfo(globalStatePDA);
      if (!gsInfo) {
        const initDiscriminator = Buffer.from([232, 254, 209, 244, 123, 89, 154, 207]);
        const initIx = new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: globalStatePDA, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_ID,
          data: initDiscriminator,
        });
        const initTx = new Transaction().add(initIx);
        const { blockhash: initBlockhash, lastValidBlockHeight: initLVBH } = await connection.getLatestBlockhash();
        initTx.recentBlockhash = initBlockhash;
        initTx.feePayer = publicKey;
        const initSig = await sendTransaction(initTx, connection);
        await connection.confirmTransaction({ signature: initSig, blockhash: initBlockhash, lastValidBlockHeight: initLVBH }, 'confirmed');
        gsInfo = await connection.getAccountInfo(globalStatePDA);
        if (!gsInfo) throw new Error('Failed to initialize GlobalState');
      }

      // dao_count is at offset 8 (after discriminator), u64 LE
      const daoCount = gsInfo.data.readBigUInt64LE(8);

      const [daoPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('dao'),
          (() => {
            const buf = Buffer.alloc(8);
            buf.writeBigUInt64LE(daoCount);
            return buf;
          })(),
        ],
        PROGRAM_ID
      );

      // Discriminator for create_dao
      const discriminator = Buffer.from([88, 46, 92, 100, 95, 79, 229, 25]);

      // Serialize: name (4+len), description (4+len), quorum_pct (u8), pass_threshold (u8), voting_period_secs (i64 LE)
      const nameBytes = Buffer.from(name, 'utf8');
      const descBytes = Buffer.from(description, 'utf8');
      const nameBuf = Buffer.alloc(4 + nameBytes.length);
      nameBuf.writeUInt32LE(nameBytes.length, 0);
      nameBytes.copy(nameBuf, 4);

      const descBuf = Buffer.alloc(4 + descBytes.length);
      descBuf.writeUInt32LE(descBytes.length, 0);
      descBytes.copy(descBuf, 4);

      const quorumBuf = Buffer.alloc(1);
      quorumBuf.writeUInt8(parseInt(quorum));

      const thresholdBuf = Buffer.alloc(1);
      thresholdBuf.writeUInt8(parseInt(threshold));

      const periodBuf = Buffer.alloc(8);
      periodBuf.writeBigInt64LE(BigInt(parseInt(votingDays) * 60));

      const data = Buffer.concat([discriminator, nameBuf, descBuf, quorumBuf, thresholdBuf, periodBuf]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: globalStatePDA, isSigner: false, isWritable: true },
          { pubkey: daoPDA, isSigner: false, isWritable: true },
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

      // Wait for RPC propagation before reloading the list
      await new Promise(r => setTimeout(r, 1500));
      await onCreated();
      onClose();
    } catch (err: any) {
      if (err?.message === 'Plugin Closed') return;
      setError(err?.message ?? 'Failed to create DAO');
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
            <h2 className="text-slate-100 font-semibold text-lg">Create DAO</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={64}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
                placeholder="My DAO"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={256}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none"
                placeholder="What does this DAO do?"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Quorum %</label>
                <input
                  type="number"
                  value={quorum}
                  onChange={(e) => setQuorum(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Pass %</label>
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Vote mins</label>
                <input
                  type="number"
                  value={votingDays}
                  onChange={(e) => setVotingDays(e.target.value)}
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
                disabled={!publicKey || !name.trim()}
                className="flex-1"
              >
                Create DAO
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
