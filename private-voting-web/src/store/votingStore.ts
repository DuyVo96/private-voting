import { create } from 'zustand';
import { ProposalAccount, VoteRecord } from '@/types/voting';

export type CurrentView = 'home' | 'proposal';

interface VotingStore {
  // Data
  proposals: ProposalAccount[];
  voteRecords: Record<string, VoteRecord[]>; // keyed by proposalPubkey

  // Navigation
  currentView: CurrentView;
  selectedProposalPubkey: string | null;

  // Loading states
  isLoading: boolean;
  isTallying: boolean;
  isVoting: boolean;

  // Actions
  setProposals: (proposals: ProposalAccount[]) => void;
  updateProposal: (proposal: ProposalAccount) => void;
  removeProposal: (pubkey: string) => void;
  setVoteRecords: (proposalPubkey: string, records: VoteRecord[]) => void;
  setView: (view: CurrentView, proposalPubkey?: string) => void;
  setLoading: (loading: boolean) => void;
  setTallying: (tallying: boolean) => void;
  setVoting: (voting: boolean) => void;
  reset: () => void;
}

const initialState = {
  proposals: [],
  voteRecords: {},
  currentView: 'home' as CurrentView,
  selectedProposalPubkey: null,
  isLoading: false,
  isTallying: false,
  isVoting: false,
};

export const useVotingStore = create<VotingStore>((set) => ({
  ...initialState,

  setProposals: (proposals) => set({ proposals }),

  updateProposal: (proposal) =>
    set((state) => {
      const idx = state.proposals.findIndex((p) => p.publicKey === proposal.publicKey);
      const updated =
        idx >= 0
          ? state.proposals.map((p, i) => (i === idx ? proposal : p))
          : [...state.proposals, proposal];
      return { proposals: updated };
    }),

  removeProposal: (pubkey) =>
    set((state) => ({
      proposals: state.proposals.filter((p) => p.publicKey !== pubkey),
    })),

  setVoteRecords: (proposalPubkey, records) =>
    set((state) => ({
      voteRecords: { ...state.voteRecords, [proposalPubkey]: records },
    })),

  setView: (view, proposalPubkey) =>
    set({
      currentView: view,
      selectedProposalPubkey: proposalPubkey ?? null,
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setTallying: (isTallying) => set({ isTallying }),
  setVoting: (isVoting) => set({ isVoting }),

  reset: () => set(initialState),
}));
