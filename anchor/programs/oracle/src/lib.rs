//! Why: the `oracle` program holds the fee index on-chain so the perp program (and anyone else) can read one trusted number instead of trusting the keeper's server.
//! How: the keeper's key is the only signer allowed to write; it pushes the priority-fee and tip sub-indices and the combined index with a slot and timestamp. Steps 5-6. Currently Anchor's starter code.

use anchor_lang::prelude::*;

declare_id!("DsdJCXmXKXiYPEcWY1u2FFiTNZvsKKwwnUjybpfniPT7");

#[program]
pub mod oracle {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
