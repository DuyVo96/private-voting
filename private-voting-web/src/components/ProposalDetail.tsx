'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { useVotingStore } from '@/store/votingStore';
import { VoteRecord } from '@/types/voting';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { VotingPanel } from './VotingPanel';
import { TallyPanel } from './TallyPanel';
import { ResultsPanel } from './ResultsPanel';
import { PrivacyExplainer } from './PrivacyExplainer';
import {
  getStatusString,
  formatTimeRemaining,
  isVotingOpen,
  isVotingEnded,
  truncatePubkey,
} from '@/utils/proposalUtils';
import { deriveVoteRecordPDA, fetchVoteRecords, parseProposalAccount } from '@/lib/solanaClient';
import { ArrowLeft, Users, Clock, Trash2 } from 'lucide-react';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

export function ProposalDetail() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const {
    selectedProposalPubkey,
    proposals,
    voteRecords,
    setVoteRecords,
    updateProposal,
    removeProposal,
    setView,
  } = useVotingStore();

  const proposal = proposals.find((p) => p.publicKey === selectedProposalPubkey);
  const records = voteRecords[selectedProposalPubkey ?? ''] ?? [];

  const [hasVoted, setHasVoted] = useState<boolean | null>(null);
  const [isFinalizingProposal, setIsFinalizingProposal] = useState(false);
  const [isDeletingProposal, setIsDeletingProposal] = useState(false);
  const [isResettingTally, setIsResettingTally] = useState(false);

  const statusStr = proposal ? getStatusString(proposal.status) : 'active';
  const isProposer = publicKey && proposal && proposal.proposer === publicKey.toBase58();

  const loadVoteRecords = useCallback(async () => {
    if (!selectedProposalPubkey) return;
    const proposalPubkey = new PublicKey(selectedProposalPubkey);
    const parsed = await fetchVoteRecords(connection, PROGRAM_ID, proposalPubkey);
    setVoteRecords(selectedProposalPubkey, parsed);

    if (publicKey) {
      const voteRecordPDA = deriveVoteRecordPDA(PROGRAM_ID, proposalPubkey, publicKey);
      const info = await connection.getAccountInfo(voteRecordPDA);
      setHasVoted(info !== null);
    }
  }, [selectedProposalPubkey, publicKey, connection]);

  const refreshProposal = useCallback(async () => {
    if (!selectedProposalPubkey) return;
    const proposalPubkey = new PublicKey(selectedProposalPubkey);
    const info = await connection.getAccountInfo(proposalPubkey);
    if (!info) return;
    const parsed = parseProposalAccount(proposalPubkey, info.data as unknown as Buffer);
    updateProposal(parsed);
  }, [selectedProposalPubkey, connection]);

  // On mount / proposal change: fetch fresh data from chain
  useEffect(() => {
    refreshProposal();
    loadVoteRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProposalPubkey, publicKey]);

  // Auto-poll while waiting for Arcium callback
  useEffect(() => {
    if (statusStr !== 'tallyInProgress') return;
    const interval = setInterval(() => refreshProposal(), 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusStr]);

  const finalizeProposal = async () => {
    if (!publicKey || !proposal) return;
    setIsFinalizingProposal(true);
    try {
      const proposalPubkey = new PublicKey(proposal.publicKey);
      const [tallyResultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('tally_result')],
        PROGRAM_ID
      );

      const discriminator = Buffer.from([23, 68, 51, 167, 109, 173, 187, 164]);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: proposalPubkey, isSigner: false, isWritable: true },
          { pubkey: tallyResultPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: discriminator,
      });

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const logs = sim.value.logs ?? [];
        const anchorError = logs.find((l: string) => l.includes('Error Message:'));
        throw new Error(anchorError ?? logs.join('\n') ?? JSON.stringify(sim.value.err));
      }

      const sig = await sendTransaction(tx, connection);
      const result = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (result.value.err) throw new Error('Transaction failed: ' + JSON.stringify(result.value.err));
      await refreshProposal();
    } catch (err) {
      console.error('Finalize failed:', err);
    } finally {
      setIsFinalizingProposal(false);
    }
  };

  const deleteProposal = async () => {
    if (!publicKey || !proposal) return;
    setIsDeletingProposal(true);
    try {
      const proposalPubkey = new PublicKey(proposal.publicKey);
      const discriminator = Buffer.from([195, 115, 85, 157, 254, 15, 175, 201]);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: proposalPubkey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: discriminator,
      });

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const logs = sim.value.logs ?? [];
        const anchorError = logs.find((l: string) => l.includes('Error Message:'));
        throw new Error(anchorError ?? logs.join('\n') ?? JSON.stringify(sim.value.err));
      }

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      removeProposal(proposal.publicKey);
      setView('home');
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeletingProposal(false);
    }
  };

  const resetTally = async () => {
    if (!publicKey || !proposal) return;
    setIsResettingTally(true);
    try {
      const proposalPubkey = new PublicKey(proposal.publicKey);
      const discriminator = Buffer.from([133, 85, 212, 169, 75, 125, 102, 223]);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: proposalPubkey, isSigner: false, isWritable: true },
        ],
        programId: PROGRAM_ID,
        data: discriminator,
      });
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      await refreshProposal();
    } catch (err) {
      if ((err as any)?.message === 'Plugin Closed') return;
      console.error('Reset tally failed:', err);
    } finally {
      setIsResettingTally(false);
    }
  };

  if (!proposal) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All Proposals
        </button>
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-slate-800 rounded w-2/3" />
          <div className="h-4 bg-slate-800 rounded w-1/2" />
          <div className="h-32 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  const statusBadgeVariant: Record<string, any> = {
    active: 'active',
    tallyPending: 'pending',
    tallyInProgress: 'tallying',
    tallyComplete: 'tallying',
    passed: 'passed',
    failed: 'failed',
  };

  const statusLabel: Record<string, string> = {
    active: 'Active',
    tallyPending: 'Awaiting Tally',
    tallyInProgress: 'Tallying...',
    tallyComplete: 'Ready to Finalize',
    passed: 'Passed',
    failed: 'Failed',
  };

  return (
    <div className="space-y-6">
      {/* Back + Delete */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All Proposals
        </button>
        {isProposer && statusStr !== 'passed' && statusStr !== 'failed' && (
          <button
            onClick={deleteProposal}
            disabled={isDeletingProposal}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isDeletingProposal ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>

      {/* Title + status */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-100 leading-snug">{proposal.title}</h1>
          <Badge variant={statusBadgeVariant[statusStr]}>{statusLabel[statusStr]}</Badge>
        </div>
        {proposal.description && (
          <p className="text-slate-400 text-sm leading-relaxed">{proposal.description}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span>By {truncatePubkey(proposal.proposer)}</span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {proposal.voteCount} vote{proposal.voteCount !== 1 ? 's' : ''}
          </span>
          {statusStr === 'active' && (
            <span className="flex items-center gap-1 text-emerald-600">
              <Clock className="w-3 h-3" />
              {formatTimeRemaining(proposal.voteEnd)}
            </span>
          )}
        </div>
      </div>

      {/* Main panel */}
      <Card>
        {/* Active voting */}
        {statusStr === 'active' && isVotingOpen(proposal) && hasVoted !== null && (
          <VotingPanel
            proposal={proposal}
            hasVoted={hasVoted}
            onVoteCast={() => { loadVoteRecords(); refreshProposal(); }}
          />
        )}

        {/* Not connected */}
        {statusStr === 'active' && isVotingOpen(proposal) && !publicKey && (
          <p className="text-sm text-slate-500">Connect your wallet to vote.</p>
        )}

        {/* Tally pending */}
        {(statusStr === 'tallyPending' || (statusStr === 'active' && isVotingEnded(proposal))) && (
          <TallyPanel
            proposal={proposal}
            voteRecords={records}
            onTallyTriggered={refreshProposal}
          />
        )}

        {/* Tally in progress — waiting for Arcium callback */}
        {statusStr === 'tallyInProgress' && (
          <div className="space-y-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-3 text-blue-300">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-medium text-sm">Arcium TEE is computing the tally...</p>
                <p className="text-xs text-blue-400/70 mt-0.5">
                  Votes are being decrypted inside the Trusted Execution Environment.
                  This usually takes 10–30 seconds.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={refreshProposal} className="w-full">
              Check for results
            </Button>
            {isProposer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetTally}
                isLoading={isResettingTally}
                className="w-full text-yellow-500/70 hover:text-yellow-400 text-xs mt-1"
              >
                Stuck? Reset &amp; retry tally
              </Button>
            )}
          </div>
        )}

        {/* Tally complete — callback fired, safe to finalize */}
        {statusStr === 'tallyComplete' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Arcium has computed the result. Finalize to record it on-chain.
            </p>
            <Button
              onClick={finalizeProposal}
              isLoading={isFinalizingProposal}
              disabled={!publicKey}
              className="w-full"
            >
              Finalize Proposal
            </Button>
          </div>
        )}

        {/* Results */}
        {(statusStr === 'passed' || statusStr === 'failed') && (
          <ResultsPanel proposal={proposal} />
        )}
      </Card>

      {/* Privacy explainer */}
      <PrivacyExplainer />
    </div>
  );
}
