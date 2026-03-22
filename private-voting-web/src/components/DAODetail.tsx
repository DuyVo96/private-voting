'use client';

import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { useVotingStore } from '@/store/votingStore';
import { ProposalAccount } from '@/types/voting';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { ProposalCard } from './ProposalCard';
import { CreateProposalModal } from './CreateProposalModal';
import { getStatusString, formatTimeRemaining } from '@/utils/proposalUtils';
import { checkMembership, deriveMemberPDA } from '@/lib/solanaClient';
import { ArrowLeft, Plus, Users, UserPlus } from 'lucide-react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require('bs58') as { encode: (buf: Uint8Array) => string };

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

const PROPOSAL_DISCRIMINATOR = Buffer.from([164, 190, 4, 248, 203, 124, 243, 64]);

export function DAODetail() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const {
    daos,
    selectedDaoPubkey,
    proposals,
    setProposals,
    setView,
    setMembership,
    membershipCache,
    removeProposal,
  } = useVotingStore();

  const dao = daos.find((d) => d.publicKey === selectedDaoPubkey);
  const proposalList = proposals[selectedDaoPubkey ?? ''] ?? [];

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const isMember = selectedDaoPubkey ? membershipCache[selectedDaoPubkey] ?? false : false;

  const DELETE_DISCRIMINATOR = Buffer.from([195, 115, 85, 157, 254, 15, 175, 201]);

  const handleDeleteProposal = async (proposal: ProposalAccount) => {
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
    if (!selectedDaoPubkey) return;
    setIsLoading(true);
    try {
      const daoPubkey = new PublicKey(selectedDaoPubkey);
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode(PROPOSAL_DISCRIMINATOR) } },
          { memcmp: { offset: 8, bytes: daoPubkey.toBase58() } },
        ],
      });

      const parsed: ProposalAccount[] = accounts.map(({ pubkey, account }) => {
        const data = account.data;
        let offset = 8 + 32; // disc + dao

        const proposalId = data.readBigUInt64LE(offset); offset += 8;
        const proposer = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32;
        const titleLen = data.readUInt32LE(offset); offset += 4;
        const title = data.slice(offset, offset + titleLen).toString('utf8'); offset += titleLen;
        const descLen = data.readUInt32LE(offset); offset += 4;
        const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;

        const statusByte = data.readUInt8(offset); offset += 1;
        const statusMap: any[] = [
          { active: {} }, { tallyPending: {} }, { tallyInProgress: {} },
          { passed: {} }, { failed: {} },
        ];
        const status = statusMap[statusByte] ?? { active: {} };

        const voteStart = data.readBigInt64LE(offset); offset += 8;
        const voteEnd = data.readBigInt64LE(offset); offset += 8;
        const voteCount = data.readUInt8(offset); offset += 1;
        const yesCount = data.readUInt32LE(offset); offset += 4;
        const noCount = data.readUInt32LE(offset); offset += 4;
        const abstainCount = data.readUInt32LE(offset); offset += 4;
        const bump = data.readUInt8(offset);

        return {
          publicKey: pubkey.toBase58(),
          dao: selectedDaoPubkey!,
          proposalId,
          proposer,
          title,
          description,
          status,
          voteStart,
          voteEnd,
          voteCount,
          yesCount,
          noCount,
          abstainCount,
          bump,
        };
      });

      setProposals(selectedDaoPubkey, parsed);
    } catch (err) {
      console.error('Failed to load proposals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkMember = async () => {
    if (!publicKey || !selectedDaoPubkey) return;
    const is = await checkMembership(connection, PROGRAM_ID, new PublicKey(selectedDaoPubkey), publicKey);
    setMembership(selectedDaoPubkey, is);
  };

  const joinDao = async () => {
    if (!publicKey || !selectedDaoPubkey) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const daoPubkey = new PublicKey(selectedDaoPubkey);
      const memberPDA = deriveMemberPDA(PROGRAM_ID, daoPubkey, publicKey);

      // Discriminator for add_member + dao_pubkey arg (required by #[instruction(dao_pubkey: Pubkey)] in context)
      const data = Buffer.concat([
        Buffer.from([13, 116, 123, 130, 126, 198, 57, 34]),
        daoPubkey.toBuffer(),
      ]);
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: daoPubkey, isSigner: false, isWritable: true },
          { pubkey: memberPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data,
      });

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Pre-simulate to surface on-chain errors before opening the wallet
      try {
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
          console.error('Simulation logs:', sim.value.logs);
          throw new Error(sim.value.logs?.join('\n') ?? JSON.stringify(sim.value.err));
        }
      } catch (simErr: any) {
        // Re-throw actual program errors (contain logs), ignore signature/rpc issues
        if (simErr?.message?.includes('Program log:') || simErr?.message?.includes('Error Number:')) {
          throw simErr;
        }
      }

      const sig = await sendTransaction(tx, connection);
      const result = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (result.value.err) throw new Error('Transaction failed: ' + JSON.stringify(result.value.err));
      // Verify on-chain before updating UI state
      await checkMember();
    } catch (err: any) {
      // User dismissed the wallet popup — not an error
      if (err?.message === 'Plugin Closed' || err?.name === 'WalletSendTransactionError' && err?.message === 'Plugin Closed') return;
      const logs: string[] | undefined = err?.logs;
      const msg = logs?.join('\n') ?? err?.message ?? err?.toString?.() ?? 'Transaction failed';
      if (logs) console.error('Transaction logs:', logs);
      else console.error('Failed to join DAO:', err);
      setJoinError(msg);
    } finally {
      setIsJoining(false);
    }
  };

  useEffect(() => {
    loadProposals();
    checkMember();
  }, [selectedDaoPubkey, publicKey]);

  if (!dao) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setView('home')}
            className="mt-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-100">{dao.name}</h1>
              {isMember && <Badge variant="member">Member</Badge>}
            </div>
            {dao.description && (
              <p className="text-slate-500 text-sm mt-1">{dao.description}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {!isMember && (
            <Button variant="secondary" size="sm" onClick={joinDao} isLoading={isJoining} disabled={!publicKey}>
              <UserPlus className="w-4 h-4" />
              Join
            </Button>
          )}
          {isMember && (
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4" />
              Proposal
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Members', value: dao.memberCount.toString() },
          { label: 'Proposals', value: dao.proposalCount.toString() },
          { label: 'Quorum', value: `${dao.quorumPercentage}%` },
        ].map(({ label, value }) => (
          <Card key={label} className="text-center py-3">
            <p className="text-xl font-bold text-slate-100">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </Card>
        ))}
      </div>

      {joinError && (
        <p className="text-red-400 text-xs px-1">{joinError}</p>
      )}

      {/* Proposals */}
      <div className="space-y-3">
        <h2 className="text-slate-200 font-semibold">Proposals</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-[#111118] border border-violet-500/10 rounded-xl p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : proposalList.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-slate-500 text-sm">No proposals yet.</p>
          </Card>
        ) : (
          proposalList.map((proposal) => (
            <ProposalCard
              key={proposal.publicKey}
              proposal={proposal}
              onClick={() => setView('proposal', selectedDaoPubkey!, proposal.publicKey)}
              onDelete={publicKey?.toBase58() === proposal.proposer ? () => handleDeleteProposal(proposal) : undefined}
            />
          ))
        )}
      </div>

      {showCreateModal && (
        <CreateProposalModal
          dao={dao}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadProposals}
        />
      )}
    </div>
  );
}
