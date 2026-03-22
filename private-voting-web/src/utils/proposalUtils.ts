import { ProposalAccount, ProposalStatus, ProposalStatusString } from '@/types/voting';

export function getStatusString(status: ProposalStatus): ProposalStatusString {
  if ('active' in status) return 'active';
  if ('tallyPending' in status) return 'tallyPending';
  if ('tallyInProgress' in status) return 'tallyInProgress';
  if ('tallyComplete' in status) return 'tallyComplete';
  if ('passed' in status) return 'passed';
  if ('failed' in status) return 'failed';
  return 'active';
}

export function isVotingOpen(proposal: ProposalAccount): boolean {
  const now = Math.floor(Date.now() / 1000);
  const voteEnd = Number(proposal.voteEnd);
  return getStatusString(proposal.status) === 'active' && now <= voteEnd;
}

export function isVotingEnded(proposal: ProposalAccount): boolean {
  const now = Math.floor(Date.now() / 1000);
  const voteEnd = Number(proposal.voteEnd);
  return now > voteEnd;
}

export function canTally(proposal: ProposalAccount): boolean {
  const status = getStatusString(proposal.status);
  return status === 'tallyPending' && isVotingEnded(proposal);
}

export function formatTimeRemaining(voteEnd: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const end = Number(voteEnd);
  const remaining = end - now;

  if (remaining <= 0) return 'Ended';

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function formatTimestamp(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function calcPassFailLabel(proposal: ProposalAccount): string {
  const status = getStatusString(proposal.status);
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  return '';
}

export function getVotePercentages(proposal: ProposalAccount): {
  yes: number;
  no: number;
  abstain: number;
} {
  const total = proposal.yesCount + proposal.noCount + proposal.abstainCount;
  if (total === 0) return { yes: 0, no: 0, abstain: 0 };
  return {
    yes: Math.round((proposal.yesCount / total) * 100),
    no: Math.round((proposal.noCount / total) * 100),
    abstain: Math.round((proposal.abstainCount / total) * 100),
  };
}

export function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`;
}
