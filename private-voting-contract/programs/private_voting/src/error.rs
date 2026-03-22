use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq)]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("The cluster is not set")]
    ClusterNotSet,
    #[msg("You have already voted on this proposal")]
    AlreadyVoted,
    #[msg("Voting is not active for this proposal")]
    VotingNotActive,
    #[msg("Voting period has not ended yet")]
    VotingStillActive,
    #[msg("Maximum number of voters reached")]
    MaxVotersReached,
    #[msg("Only the proposer can perform this action")]
    NotProposer,
    #[msg("Tally result does not match this proposal")]
    TallyProposalMismatch,
}
