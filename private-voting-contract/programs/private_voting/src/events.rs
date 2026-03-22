use anchor_lang::prelude::*;

#[event]
pub struct VoteCastEvent {
    pub proposal: Pubkey,
    pub voter: Pubkey,
}

#[event]
pub struct TallyCompleteEvent {
    pub proposal: Pubkey,
    pub yes: u32,
    pub no: u32,
    pub abstain: u32,
}

#[event]
pub struct ProposalFinalizedEvent {
    pub proposal: Pubkey,
    pub passed: bool,
    pub yes: u32,
    pub no: u32,
    pub abstain: u32,
}
