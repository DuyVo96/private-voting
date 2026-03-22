use arcium_anchor::prelude::*;

pub const COMP_DEF_OFFSET_TALLY_VOTES: u32 = comp_def_offset("tally_votes_v4");

// Maximum number of voters per proposal (matches circuit slot count)
pub const MAX_VOTERS: usize = 5;
