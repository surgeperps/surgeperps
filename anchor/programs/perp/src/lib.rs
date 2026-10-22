//! Why: the `perp` program is the market itself. It lets users go long or short the blockspace-cost index, so apps can cap their fee bill and validators can lock in fee income.
//! How: reads the index from the oracle program, tracks positions and margin, charges funding, liquidates under-margined accounts and enforces position limits (the main defence against index manipulation). Steps 8-11. Currently Anchor's starter code.

use anchor_lang::prelude::*;

declare_id!("3ybvQ2fhnTV3qmzTSG6d8i5JpNqVpxe9D8e56arPsHhD");

#[program]
pub mod perp {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
