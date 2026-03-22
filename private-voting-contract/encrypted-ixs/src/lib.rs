use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub struct TallyOutput {
        pub yes: u32,
        pub no: u32,
        pub abstain: u32,
    }

    // Each voter has their own encryption context (ArcisPubkey + nonce + ciphertext).
    // The circuit receives 5 slots (MAX_VOTERS) plus a plaintext count of actual votes.
    // Slots beyond `count` are padded with dummy values and ignored.
    // Vote encoding: 1 = Yes, 0 = No, 2 = Abstain
    #[instruction]
    pub fn tally_votes_v4(
        v0: Enc<Shared, u8>,
        v1: Enc<Shared, u8>,
        v2: Enc<Shared, u8>,
        v3: Enc<Shared, u8>,
        v4: Enc<Shared, u8>,
        count: u128,
    ) -> TallyOutput {
        let mut yes = 0u32;
        let mut no = 0u32;
        let mut abstain = 0u32;
        let n = count as usize;

        if n > 0 {
            let v = v0.to_arcis();
            if v == 1 {
                yes += 1;
            } else if v == 0 {
                no += 1;
            } else {
                abstain += 1;
            }
        }
        if n > 1 {
            let v = v1.to_arcis();
            if v == 1 {
                yes += 1;
            } else if v == 0 {
                no += 1;
            } else {
                abstain += 1;
            }
        }
        if n > 2 {
            let v = v2.to_arcis();
            if v == 1 {
                yes += 1;
            } else if v == 0 {
                no += 1;
            } else {
                abstain += 1;
            }
        }
        if n > 3 {
            let v = v3.to_arcis();
            if v == 1 {
                yes += 1;
            } else if v == 0 {
                no += 1;
            } else {
                abstain += 1;
            }
        }
        if n > 4 {
            let v = v4.to_arcis();
            if v == 1 {
                yes += 1;
            } else if v == 0 {
                no += 1;
            } else {
                abstain += 1;
            }
        }

        TallyOutput { yes, no, abstain }.reveal()
    }
}

#[cfg(test)]
mod tests {
    use super::circuits::*;

    #[test]
    fn test_tally_logic() {
        // vote encoding: 1=yes, 0=no, 2=abstain
        // Simulate: yes=1, no=1, abstain=1 with count=3
        // (actual circuit values are encrypted; this just validates the counting logic)
        let mut yes = 0u32;
        let mut no = 0u32;
        let mut abstain = 0u32;

        let votes = [1u8, 0u8, 2u8];
        for &v in votes.iter() {
            if v == 1 {
                yes += 1;
            } else if v == 0 {
                no += 1;
            } else {
                abstain += 1;
            }
        }

        assert_eq!(yes, 1);
        assert_eq!(no, 1);
        assert_eq!(abstain, 1);
    }
}
