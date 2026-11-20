//! Why: the `oracle` program holds the fee index on-chain so the perp program
//!      (and anyone else) can read one trusted number instead of trusting the
//!      keeper's server.
//! How: one PDA account (seed "oracle") stores the two sub-indices the keeper
//!      measures (priority fees and Jito tips, lamports per slot) and the
//!      combined index the perp settles on:
//!        index = (priority * priority_weight_bps + tips * (10000 - priority_weight_bps)) / 10000
//!      Only the stored authority (the keeper's wallet) can write. The slot and
//!      time of each update come from the chain clock, so readers can reject
//!      stale values. Weights are set by the authority on a schedule, not live
//!      (see docs/decisions.md). Steps 5-6.

use anchor_lang::prelude::*;

declare_id!("DsdJCXmXKXiYPEcWY1u2FFiTNZvsKKwwnUjybpfniPT7");

pub const BPS: u64 = 10_000;
/// 79% priority fees / 21% tips: trailing-365-day spend share (docs/market-data.md).
pub const DEFAULT_PRIORITY_WEIGHT_BPS: u16 = 7_900;

#[program]
pub mod oracle {
    use super::*;

    /// Creates the oracle account once; the signer becomes the authority.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let o = &mut ctx.accounts.oracle;
        o.authority = ctx.accounts.authority.key();
        o.priority_index = 0;
        o.tip_index = 0;
        o.index = 0;
        o.priority_weight_bps = DEFAULT_PRIORITY_WEIGHT_BPS;
        o.last_update_slot = 0;
        o.last_update_ts = 0;
        o.bump = ctx.bumps.oracle;
        Ok(())
    }

    /// The keeper publishes both sub-indices; the combined index is computed here
    /// so the weighting can't differ between the keeper and the chain.
    pub fn update_index(ctx: Context<UpdateIndex>, priority_index: u64, tip_index: u64) -> Result<()> {
        let o = &mut ctx.accounts.oracle;
        let clock = Clock::get()?;
        o.priority_index = priority_index;
        o.tip_index = tip_index;
        o.index = combine(priority_index, tip_index, o.priority_weight_bps)?;
        o.last_update_slot = clock.slot;
        o.last_update_ts = clock.unix_timestamp;
        emit!(IndexUpdated {
            priority_index,
            tip_index,
            index: o.index,
            slot: clock.slot,
        });
        Ok(())
    }

    /// Scheduled weight reset. Takes effect from the next update.
    pub fn set_weights(ctx: Context<UpdateIndex>, priority_weight_bps: u16) -> Result<()> {
        require!(u64::from(priority_weight_bps) <= BPS, OracleError::BadWeight);
        ctx.accounts.oracle.priority_weight_bps = priority_weight_bps;
        Ok(())
    }

    /// Hands the oracle to a new keeper key (e.g. after a key leak).
    pub fn set_authority(ctx: Context<UpdateIndex>, new_authority: Pubkey) -> Result<()> {
        ctx.accounts.oracle.authority = new_authority;
        Ok(())
    }
}

pub fn combine(priority: u64, tips: u64, priority_weight_bps: u16) -> Result<u64> {
    let w = u128::from(priority_weight_bps);
    let v = (u128::from(priority) * w + u128::from(tips) * (u128::from(BPS) - w)) / u128::from(BPS);
    u64::try_from(v).map_err(|_| error!(OracleError::Overflow))
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Oracle::INIT_SPACE,
              seeds = [b"oracle"], bump)]
    pub oracle: Account<'info, Oracle>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateIndex<'info> {
    #[account(mut, seeds = [b"oracle"], bump = oracle.bump, has_one = authority)]
    pub oracle: Account<'info, Oracle>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Oracle {
    pub authority: Pubkey,        // only this wallet can update the index
    pub priority_index: u64,      // median priority fee per slot, lamports
    pub tip_index: u64,           // median Jito tips per Jito block, lamports
    pub index: u64,               // weighted combination; what the perp settles on
    pub priority_weight_bps: u16, // weight of priority_index; tips get the rest
    pub last_update_slot: u64,
    pub last_update_ts: i64,
    pub bump: u8,
}

#[event]
pub struct IndexUpdated {
    pub priority_index: u64,
    pub tip_index: u64,
    pub index: u64,
    pub slot: u64,
}

#[error_code]
pub enum OracleError {
    #[msg("Weight must be at most 10000 bps")]
    BadWeight,
    #[msg("Index overflow")]
    Overflow,
}
