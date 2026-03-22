'use client';

import React from 'react';
import { ProposalAccount } from '@/types/voting';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { getStatusString, formatTimeRemaining, getVotePercentages } from '@/utils/proposalUtils';
import { Users, Trash2 } from 'lucide-react';

interface ProposalCardProps {
  proposal: ProposalAccount;
  onClick: () => void;
  onDelete?: () => Promise<void>;
}

const statusLabel: Record<string, string> = {
  active: 'Active',
  tallyPending: 'Awaiting Tally',
  tallyInProgress: 'Tallying',
  tallyComplete: 'Ready to Finalize',
  passed: 'Passed',
  failed: 'Failed',
};

const statusVariant: Record<string, any> = {
  active: 'active',
  tallyPending: 'pending',
  tallyInProgress: 'tallying',
  tallyComplete: 'tallying',
  passed: 'passed',
  failed: 'failed',
};

export function ProposalCard({ proposal, onClick, onDelete }: ProposalCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const status = getStatusString(proposal.status);
  const isFinalized = status === 'passed' || status === 'failed';
  const pcts = isFinalized ? getVotePercentages(proposal) : null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card hover onClick={onClick} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-medium leading-snug tracking-tight">{proposal.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1 text-[#555] hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
              title="Delete proposal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {proposal.description && (
        <p className="text-[#555] text-sm line-clamp-2">{proposal.description}</p>
      )}

      <div className="flex items-center justify-between text-xs text-[#555]">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {proposal.voteCount} vote{proposal.voteCount !== 1 ? 's' : ''}
        </span>

        {status === 'active' && (
          <span className="text-[#6B35E8] text-[10px] tracking-widest uppercase">
            {formatTimeRemaining(proposal.voteEnd)}
          </span>
        )}

        {isFinalized && pcts && (
          <span className="flex gap-3 text-[10px] tracking-wider uppercase">
            <span className="text-emerald-400">Y {pcts.yes}%</span>
            <span className="text-red-400">N {pcts.no}%</span>
          </span>
        )}
      </div>

      {isFinalized && pcts && (
        <div className="flex h-0.5 overflow-hidden bg-white/5">
          <div className="bg-emerald-500 transition-all" style={{ width: `${pcts.yes}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${pcts.no}%` }} />
          <div className="bg-white/10 transition-all" style={{ width: `${pcts.abstain}%` }} />
        </div>
      )}
    </Card>
  );
}
