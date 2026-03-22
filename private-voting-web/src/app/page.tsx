'use client';

export const dynamic = 'force-dynamic';

import { useVotingStore } from '@/store/votingStore';
import { ProposalList } from '@/components/ProposalList';
import { ProposalDetail } from '@/components/ProposalDetail';

export default function Home() {
  const { currentView } = useVotingStore();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {currentView === 'home' && <ProposalList />}
      {currentView === 'proposal' && <ProposalDetail />}
    </div>
  );
}
