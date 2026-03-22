mod constants;
mod contexts;
mod error;
mod events;
mod types;

use crate::{contexts::*, error::ErrorCode, events::*, types::*};
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CallbackAccount, CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;


declare_id!("12ZH1djwEKpH4P5EvtcchozhxYXPbMa8GsWEuuRnnJPD");

#[arcium_program]
pub mod private_voting {
    use super::*;

    // ─── 1. Initialize GlobalState ────────────────────────────────────────────

    pub fn initialize_global_state(ctx: Context<InitGlobalState>) -> Result<()> {
        ctx.accounts.global_state.proposal_count = 0;
        ctx.accounts.global_state.bump = ctx.bumps.global_state;
        Ok(())
    }

    // ─── 2. Initialize TallyResult (singleton) ───────────────────────────────

    pub fn initialize_tally_result(ctx: Context<InitTallyResult>) -> Result<()> {
        ctx.accounts.tally_result.bump = ctx.bumps.tally_result;
        Ok(())
    }

    // ─── 3. Create Proposal ───────────────────────────────────────────────────

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        voting_period_secs: i64,
        pass_threshold: u8,
        min_votes: u32,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let proposal_id = ctx.accounts.global_state.proposal_count;

        let proposal = &mut ctx.accounts.proposal_account;
        proposal.proposer = ctx.accounts.payer.key();
        proposal.proposal_id = proposal_id;
        proposal.title = title;
        proposal.description = description;
        proposal.voting_period_secs = voting_period_secs;
        proposal.pass_threshold = pass_threshold;
        proposal.min_votes = min_votes;
        proposal.status = ProposalStatus::Active;
        proposal.vote_start = now;
        proposal.vote_end = now + voting_period_secs;
        proposal.vote_count = 0;
        proposal.yes_count = 0;
        proposal.no_count = 0;
        proposal.abstain_count = 0;
        proposal.bump = ctx.bumps.proposal_account;

        ctx.accounts.global_state.proposal_count += 1;
        Ok(())
    }

    // ─── 4. Delete Proposal ───────────────────────────────────────────────────

    pub fn delete_proposal(_ctx: Context<DeleteProposal>) -> Result<()> {
        // Anchor closes the account and transfers lamports to proposer via close = proposer
        Ok(())
    }

    // ─── 5. Cast Vote ─────────────────────────────────────────────────────────

    pub fn cast_vote(
        ctx: Context<CastVote>,
        _proposal_pubkey: Pubkey,
        enc_pubkey: [u8; 32],
        nonce: u128,
        vote_ct: [u8; 32],
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal_account;

        // Ensure voting window is open
        let now = Clock::get()?.unix_timestamp;
        require!(
            proposal.status == ProposalStatus::Active && now <= proposal.vote_end,
            ErrorCode::VotingNotActive
        );
        require!(
            (proposal.vote_count as usize) < crate::constants::MAX_VOTERS,
            ErrorCode::MaxVotersReached
        );

        // Store the encrypted vote record
        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.proposal = proposal.key();
        vote_record.voter = ctx.accounts.payer.key();
        vote_record.encryption_pubkey = enc_pubkey;
        vote_record.nonce = nonce;
        vote_record.encrypted_vote = vote_ct;
        vote_record.voted_at = now;
        vote_record.bump = ctx.bumps.vote_record;

        proposal.vote_count += 1;

        emit!(VoteCastEvent {
            proposal: proposal.key(),
            voter: ctx.accounts.payer.key(),
        });

        Ok(())
    }

    // ─── 6. Mark Proposal Ready for Tally ────────────────────────────────────

    pub fn mark_tally_pending(ctx: Context<MarkTallyPending>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let proposal = &mut ctx.accounts.proposal_account;
        require!(
            now > proposal.vote_end,
            ErrorCode::VotingStillActive
        );
        require!(
            proposal.status == ProposalStatus::Active,
            ErrorCode::VotingNotActive
        );
        proposal.status = ProposalStatus::TallyPending;
        Ok(())
    }

    // ─── 7. Initialize Tally Comp Def ────────────────────────────────────────

    pub fn init_tally_comp_def(ctx: Context<InitTallyCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://raw.githubusercontent.com/DuyVo96/arcium-circuits/main/tally_votes_v2.arcis".to_string(),
                hash: circuit_hash!("tally_votes_v4"),
            })),
            None,
        )
    }

    // ─── 8. Tally Votes (queue Arcium computation) ────────────────────────────

    pub fn tally_votes(
        ctx: Context<TallyVotes>,
        computation_offset: u64,
        actual_count: u8,
        enc_pubkeys: [[u8; 32]; 5],
        nonces: [u128; 5],
        vote_cts: [[u8; 32]; 5],
    ) -> Result<()> {
        // Store which proposal this tally is for
        ctx.accounts.tally_result.proposal = ctx.accounts.proposal_account.key();
        ctx.accounts.proposal_account.status = ProposalStatus::TallyInProgress;
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(enc_pubkeys[0]).plaintext_u128(nonces[0]).encrypted_u8(vote_cts[0])
            .x25519_pubkey(enc_pubkeys[1]).plaintext_u128(nonces[1]).encrypted_u8(vote_cts[1])
            .x25519_pubkey(enc_pubkeys[2]).plaintext_u128(nonces[2]).encrypted_u8(vote_cts[2])
            .x25519_pubkey(enc_pubkeys[3]).plaintext_u128(nonces[3]).encrypted_u8(vote_cts[3])
            .x25519_pubkey(enc_pubkeys[4]).plaintext_u128(nonces[4]).encrypted_u8(vote_cts[4])
            .plaintext_u128(actual_count as u128)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![TallyVotesV4Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount { pubkey: ctx.accounts.tally_result.key(), is_writable: true },
                    CallbackAccount { pubkey: ctx.accounts.proposal_account.key(), is_writable: true },
                ],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    // ─── 8b. Reset Tally (unstick proposals stuck at TallyInProgress) ─────────

    pub fn reset_tally(ctx: Context<ResetTally>) -> Result<()> {
        ctx.accounts.proposal_account.status = ProposalStatus::TallyPending;
        Ok(())
    }

    // ─── 9. Tally Votes Callback ─────────────────────────────────────────────

    #[arcium_callback(encrypted_ix = "tally_votes_v4", auto_serialize = false)]
    pub fn tally_votes_v4_callback(
        ctx: Context<TallyVotesV4Callback>,
        output: RawComputationOutputs<TallyVotesV4Output>,
    ) -> Result<()> {
        let result = match output {
            RawComputationOutputs::Success(o) => o,
            RawComputationOutputs::Failure => return Err(error!(ErrorCode::AbortedComputation)),
        };

        let yes     = result.field_0.field_0;
        let no      = result.field_0.field_1;
        let abstain = result.field_0.field_2;

        ctx.accounts.tally_result.yes = yes;
        ctx.accounts.tally_result.no = no;
        ctx.accounts.tally_result.abstain = abstain;
        ctx.accounts.proposal_account.status = ProposalStatus::TallyComplete;

        let proposal_key = ctx.accounts.tally_result.proposal;
        emit!(TallyCompleteEvent { proposal: proposal_key, yes, no, abstain });

        Ok(())
    }

    // ─── 10. Finalize Proposal ────────────────────────────────────────────────

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        let tally = &ctx.accounts.tally_result;
        let proposal = &mut ctx.accounts.proposal_account;

        let yes = tally.yes;
        let no = tally.no;
        let abstain = tally.abstain;
        let total_votes = yes + no + abstain;

        let yes_pct = if total_votes > 0 {
            (yes * 100) / total_votes
        } else {
            0
        };
        let quorum_met = total_votes >= proposal.min_votes;
        let passed = yes_pct >= proposal.pass_threshold as u32 && quorum_met;

        proposal.yes_count = yes;
        proposal.no_count = no;
        proposal.abstain_count = abstain;
        proposal.status = if passed {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Failed
        };

        emit!(ProposalFinalizedEvent {
            proposal: proposal.key(),
            passed,
            yes,
            no,
            abstain,
        });

        Ok(())
    }
}
