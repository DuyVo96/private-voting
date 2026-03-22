'use client';

import React from 'react';
import { ProposalAccount } from '@/types/voting';
import { getVotePercentages, getStatusString } from '@/utils/proposalUtils';
import { Badge } from './ui/Badge';
import { CheckCircle, XCircle } from 'lucide-react';

interface ResultsPanelProps {
  proposal: ProposalAccount;
}

export function ResultsPanel({ proposal }: ResultsPanelProps) {
  const pcts = getVotePercentages(proposal);
  const status = getStatusString(proposal.status);
  const total = proposal.yesCount + proposal.noCount + proposal.abstainCount;
  const passed = status === 'passed';

  return (
    <div className="space-y-5">
      {/* Pass/Fail banner */}
      <div
        className={`flex items-center gap-3 p-4 rounded-xl border ${
          passed
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}
      >
        {passed ? (
          <CheckCircle className="w-6 h-6 text-emerald-400" />
        ) : (
          <XCircle className="w-6 h-6 text-red-400" />
        )}
        <div>
          <p className={`font-semibold ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
            Proposal {passed ? 'Passed' : 'Failed'}
          </p>
          <p className="text-xs text-slate-500">{total} total votes counted</p>
        </div>
      </div>

      {/* Vote bars */}
      <div className="space-y-3">
        {[
          { label: 'Yes', count: proposal.yesCount, pct: pcts.yes, color: 'bg-emerald-500', text: 'text-emerald-400' },
          { label: 'No', count: proposal.noCount, pct: pcts.no, color: 'bg-red-500', text: 'text-red-400' },
          { label: 'Abstain', count: proposal.abstainCount, pct: pcts.abstain, color: 'bg-slate-500', text: 'text-slate-400' },
        ].map(({ label, count, pct, color, text }) => (
          <div key={label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={`font-medium ${text}`}>{label}</span>
              <span className="text-slate-400">
                {count} vote{count !== 1 ? 's' : ''} ({pct}%)
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
