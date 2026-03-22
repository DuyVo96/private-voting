use crate::{constants::*, error::ErrorCode, types::*, ArciumSignerAccount};
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use crate::{ID, ID_CONST};

// ─── Initialize GlobalState ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitGlobalState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    pub system_program: Program<'info, System>,
}

// ─── Create Proposal ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(
        init,
        payer = payer,
        space = 8 + ProposalAccount::INIT_SPACE,
        seeds = [b"proposal", global_state.proposal_count.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    pub system_program: Program<'info, System>,
}

// ─── Delete Proposal ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct DeleteProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(
        mut,
        close = proposer,
        constraint = proposal_account.proposer == proposer.key() @ ErrorCode::NotProposer,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    pub system_program: Program<'info, System>,
}

// ─── Cast Vote ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(proposal_pubkey: Pubkey)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = proposal_account.status == ProposalStatus::Active @ ErrorCode::VotingNotActive,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", proposal_account.key().as_ref(), payer.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

// ─── Init Tally Comp Def ─────────────────────────────────────────────────────

#[init_computation_definition_accounts("tally_votes_v4", payer)]
#[derive(Accounts)]
pub struct InitTallyCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── Reset Tally (unstick TallyInProgress → TallyPending) ───────────────────

#[derive(Accounts)]
pub struct ResetTally<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(
        mut,
        constraint = proposal_account.proposer == proposer.key() @ ErrorCode::NotProposer,
        constraint = proposal_account.status == ProposalStatus::TallyInProgress @ ErrorCode::VotingNotActive,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
}

// ─── Tally Votes (queue computation) ─────────────────────────────────────────

#[queue_computation_accounts("tally_votes_v4", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct TallyVotes<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [b"ArciumSignerAccount"],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,

    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_TALLY_VOTES)
    )]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,

    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    )]
    pub clock_account: Account<'info, ClockAccount>,

    #[account(
        mut,
        constraint = proposal_account.status == ProposalStatus::TallyPending @ ErrorCode::VotingStillActive,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,

    #[account(
        mut,
        seeds = [b"tally_result"],
        bump,
    )]
    pub tally_result: Account<'info, TallyResult>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

// ─── Tally Votes Callback ─────────────────────────────────────────────────────

#[callback_accounts("tally_votes_v4")]
#[derive(Accounts)]
pub struct TallyVotesV4Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_TALLY_VOTES)
    )]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"tally_result"],
        bump,
    )]
    pub tally_result: Account<'info, TallyResult>,

    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
}

// ─── Init Tally Result ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitTallyResult<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + TallyResult::INIT_SPACE,
        seeds = [b"tally_result"],
        bump
    )]
    pub tally_result: Account<'info, TallyResult>,
    pub system_program: Program<'info, System>,
}

// ─── Mark Tally Pending ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct MarkTallyPending<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
    pub system_program: Program<'info, System>,
}

// ─── Finalize Proposal ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = proposal_account.status == ProposalStatus::TallyComplete @ ErrorCode::VotingNotActive,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,

    #[account(
        mut,
        seeds = [b"tally_result"],
        bump,
        constraint = tally_result.proposal == proposal_account.key() @ ErrorCode::TallyProposalMismatch,
    )]
    pub tally_result: Account<'info, TallyResult>,

    pub system_program: Program<'info, System>,
}
