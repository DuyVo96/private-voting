export interface GlobalState {
  proposalCount: bigint;
  bump: number;
}

export interface ProposalAccount {
  publicKey: string;
  proposer: string;
  proposalId: bigint;
  title: string;
  description: string;
  votingPeriodSecs: bigint;
  passThreshold: number;
  minVotes: number;
  status: ProposalStatus;
  voteStart: bigint;
  voteEnd: bigint;
  voteCount: number;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  bump: number;
}

export interface VoteRecord {
  publicKey: string;
  proposal: string;
  voter: string;
  encryptionPubkey: number[];
  nonce: bigint;
  encryptedVote: number[];
  votedAt: bigint;
  bump: number;
}

export interface TallyResult {
  proposal: string;
  yes: number;
  no: number;
  abstain: number;
  bump: number;
}

export type ProposalStatus =
  | { active: {} }
  | { tallyPending: {} }
  | { tallyInProgress: {} }
  | { tallyComplete: {} }
  | { passed: {} }
  | { failed: {} };

export type ProposalStatusString = 'active' | 'tallyPending' | 'tallyInProgress' | 'tallyComplete' | 'passed' | 'failed';

export interface EncryptedVote {
  enc_pubkey: number[];
  nonce: any; // anchor.BN
  vote_ct: number[];
}

export type VoteChoice = 0 | 1 | 2; // 0=No, 1=Yes, 2=Abstain
