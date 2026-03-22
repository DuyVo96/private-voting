'use client';

import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { useVotingStore } from '@/store/votingStore';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ProposalCard } from './ProposalCard';
import { CreateProposalModal } from './CreateProposalModal';
import { Plus, Shield } from 'lucide-react';
import { fetchAllProposals } from '@/lib/solanaClient';
import { HowItWorks } from './HowItWorks';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

export function ProposalList() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { proposals, setProposals, setView, isLoading, setLoading, removeProposal } = useVotingStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const DELETE_DISCRIMINATOR = Buffer.from([195, 115, 85, 157, 254, 15, 175, 201]);

  const handleDelete = async (proposal: { publicKey: string }) => {
    if (!publicKey) return;
    const proposalPubkey = new PublicKey(proposal.publicKey);
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: proposalPubkey, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: DELETE_DISCRIMINATOR,
    });
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;
    const sig = await sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    removeProposal(proposal.publicKey);
  };

  const loadProposals = async () => {
    setLoading(true);
    try {
      const parsed = await fetchAllProposals(connection, PROGRAM_ID);
      setProposals(parsed);
    } catch (err) {
      console.error('Failed to load proposals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [connection]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[#6B35E8] text-[10px] tracking-[0.2em] uppercase mb-1">On-chain governance</p>
          <h1 className="text-2xl font-bold text-white tracking-tight">Proposals</h1>
        </div>
        <Button onClick={() => setShowCreateModal(true)} disabled={!publicKey} arrow>
          <Plus className="w-3.5 h-3.5" />
          New Proposal
        </Button>
      </div>

      {/* Privacy callout */}
      <div className="arc-bracket flex items-start gap-3 p-4 bg-[rgba(107,53,232,0.05)] border border-[rgba(107,53,232,0.2)] text-sm text-[#a78bfa]">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 text-[#6B35E8]" />
        <span className="text-[#888] text-xs leading-relaxed">
          Votes are encrypted before submission and tallied inside{' '}
          <span className="text-[#a78bfa]">Arcium&apos;s TEE</span> — only final aggregate results are published on-chain.
        </span>
      </div>

      <HowItWorks />

      {/* Proposal list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#080808] border border-[rgba(107,53,232,0.15)] p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#888] text-xs tracking-widest uppercase">No proposals yet. Create the first one.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.publicKey}
              proposal={proposal}
              onClick={() => setView('proposal', proposal.publicKey)}
              onDelete={publicKey?.toBase58() === proposal.proposer ? () => handleDelete(proposal) : undefined}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateProposalModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadProposals}
        />
      )}
    </div>
  );
}
