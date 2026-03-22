use anchor_lang::prelude::*;

// GlobalState PDA [b"global_state"]
#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub proposal_count: u64,
    pub bump: u8,
}

// ProposalAccount PDA [b"proposal", proposal_id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct ProposalAccount {
    pub proposer: Pubkey,
    pub proposal_id: u64,
    #[max_len(128)]
    pub title: String,
    #[max_len(512)]
    pub description: String,
    pub voting_period_secs: i64,
    pub pass_threshold: u8,   // e.g. 51 = 51% yes required
    pub min_votes: u32,        // minimum votes for quorum
    pub status: ProposalStatus,
    pub vote_start: i64,
    pub vote_end: i64,
    pub vote_count: u8,
    pub yes_count: u32,
    pub no_count: u32,
    pub abstain_count: u32,
    pub bump: u8,
}

// VoteRecord PDA [b"vote", proposal_pubkey, voter_pubkey]
#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub encryption_pubkey: [u8; 32],
    pub nonce: u128,
    pub encrypted_vote: [u8; 32],
    pub voted_at: i64,
    pub bump: u8,
}

// TallyResult PDA [b"tally_result"] — singleton, updated by Arcium callback
#[account]
#[derive(InitSpace)]
pub struct TallyResult {
    pub proposal: Pubkey, // which proposal this tally is for
    pub yes: u32,
    pub no: u32,
    pub abstain: u32,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum ProposalStatus {
    Active,
    TallyPending,
    TallyInProgress,  // tally_votes queued, waiting for Arcium callback
    TallyComplete,    // callback fired, ready to finalize
    Passed,
    Failed,
}
