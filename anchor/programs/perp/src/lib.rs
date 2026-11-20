//! Why: the `perp` program is the market itself. It lets users go long or short
//!      the blockspace-cost index, so apps can cap their fee bill and
//!      validators can lock in fee income.
//! How: one Market account (seed "market") holds all SOL: trader collateral
//!      plus the liquidity pool (LP) that takes the other side of every trade.
//!      Trades fill at the oracle index. Each Position (seed "position",
//!      market, owner) is marked to market on every touch: PnL and funding
//!      move between the trader's collateral and the LP balance.
//!        - size: signed, in units of SIZE_PRECISION = "one slot of blockspace".
//!          A long of size S gains S * (index_now - index_then) lamports.
//!        - margin: initial margin to add exposure or withdraw, maintenance
//!          margin below which anyone can liquidate.
//!        - funding: the side with more open interest pays, in proportion to
//!          the long/short skew, so the LP isn't left holding one side.
//!        - limits: max size per position and max skew; the main defence
//!          against a validator pushing the index (docs/design.md).
//!      Steps 8-11.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use oracle::Oracle;

declare_id!("3ybvQ2fhnTV3qmzTSG6d8i5JpNqVpxe9D8e56arPsHhD");

/// Size units per "one slot of blockspace". Size 1_000_000 = PnL of 1 lamport per lamport of index move.
pub const SIZE_PRECISION: i128 = 1_000_000;
/// Extra precision for cumulative funding so per-slot amounts don't round to zero.
pub const FUNDING_PRECISION: i128 = 1_000_000;
pub const BPS: i128 = 10_000;
pub const SLOTS_PER_DAY: i128 = 216_000;

#[program]
pub mod perp {
    use super::*;

    pub fn initialize_market(ctx: Context<InitializeMarket>, params: MarketParams) -> Result<()> {
        params.validate()?;
        let m = &mut ctx.accounts.market;
        m.admin = ctx.accounts.admin.key();
        m.oracle = ctx.accounts.oracle.key();
        m.params = params;
        m.lp_balance = 0;
        m.long_oi = 0;
        m.short_oi = 0;
        m.cumulative_funding = 0;
        m.last_funding_slot = Clock::get()?.slot;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn update_params(ctx: Context<AdminOnly>, params: MarketParams) -> Result<()> {
        params.validate()?;
        ctx.accounts.market.params = params;
        Ok(())
    }

    /// Admin seeds the liquidity pool that takes the other side of trades.
    pub fn fund_lp(ctx: Context<AdminTransfer>, amount: u64) -> Result<()> {
        transfer_in(&ctx.accounts.admin, &ctx.accounts.market, &ctx.accounts.system_program, amount)?;
        let m = &mut ctx.accounts.market;
        m.lp_balance = m.lp_balance.checked_add(to_i64(amount)?).ok_or(PerpError::MathOverflow)?;
        Ok(())
    }

    pub fn withdraw_lp(ctx: Context<AdminTransfer>, amount: u64) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(m.lp_balance >= to_i64(amount)?, PerpError::InsufficientLp);
        // Not yet checked against open positions: the admin must leave enough to cover the skew.
        m.lp_balance -= to_i64(amount)?;
        transfer_out(&ctx.accounts.market, &ctx.accounts.admin, amount)
    }

    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        let p = &mut ctx.accounts.position;
        p.owner = ctx.accounts.owner.key();
        p.market = ctx.accounts.market.key();
        p.collateral = 0;
        p.size = 0;
        p.entry_index = 0;
        p.last_cumulative_funding = ctx.accounts.market.cumulative_funding;
        p.bump = ctx.bumps.position;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, PerpError::ZeroAmount);
        transfer_in(&ctx.accounts.owner, &ctx.accounts.market, &ctx.accounts.system_program, amount)?;
        let p = &mut ctx.accounts.position;
        p.collateral = p.collateral.checked_add(to_i64(amount)?).ok_or(PerpError::MathOverflow)?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Trade>, amount: u64) -> Result<()> {
        require!(amount > 0, PerpError::ZeroAmount);
        let index = read_index(&ctx.accounts.market, &ctx.accounts.oracle)?;
        let m = &mut ctx.accounts.market;
        let p = &mut ctx.accounts.position;
        accrue_funding(m, index)?;
        settle(m, p, index)?;

        let left = p.collateral.checked_sub(to_i64(amount)?).ok_or(PerpError::MathOverflow)?;
        require!(left >= 0, PerpError::InsufficientCollateral);
        require!(
            i128::from(left) >= margin(p.size, index, m.params.initial_margin_bps),
            PerpError::InsufficientMargin
        );
        p.collateral = left;
        transfer_out(&ctx.accounts.market, &ctx.accounts.owner, amount)
    }

    /// Changes the position by `size_delta` (positive = buy, negative = sell) at the oracle index.
    pub fn trade(ctx: Context<Trade>, size_delta: i64) -> Result<()> {
        require!(size_delta != 0, PerpError::ZeroAmount);
        let index = read_index(&ctx.accounts.market, &ctx.accounts.oracle)?;
        let m = &mut ctx.accounts.market;
        let p = &mut ctx.accounts.position;
        accrue_funding(m, index)?;
        settle(m, p, index)?;

        let old = p.size;
        let new = old.checked_add(size_delta).ok_or(PerpError::MathOverflow)?;
        // adding exposure: bigger, or flipped to the other side (closing to zero is not)
        let increasing = new.unsigned_abs() > old.unsigned_abs() || (old != 0 && new != 0 && new.signum() != old.signum());

        // open interest
        let (old_long, old_short) = split(old);
        let (new_long, new_short) = split(new);
        let old_skew = i128::from(m.long_oi) - i128::from(m.short_oi);
        m.long_oi = m.long_oi - old_long + new_long;
        m.short_oi = m.short_oi - old_short + new_short;
        let new_skew = i128::from(m.long_oi) - i128::from(m.short_oi);

        if increasing {
            require!(new.unsigned_abs() <= m.params.max_position_size, PerpError::PositionLimit);
            require!(m.lp_balance >= 0, PerpError::InsufficientLp);
            require!(
                p.collateral as i128 >= margin(new, index, m.params.initial_margin_bps),
                PerpError::InsufficientMargin
            );
        }
        // Trades that push the skew further out must stay inside the cap; trades that reduce it are always allowed.
        if new_skew.abs() > old_skew.abs() {
            require!(new_skew.unsigned_abs() <= u128::from(m.params.max_skew), PerpError::SkewLimit);
        }

        // taker fee on traded notional, paid to the LP
        let fee = notional(i64::try_from(size_delta.unsigned_abs()).map_err(|_| PerpError::MathOverflow)?, index)
            * i128::from(m.params.taker_fee_bps)
            / BPS;
        let fee = i64::try_from(fee).map_err(|_| PerpError::MathOverflow)?;
        p.collateral -= fee;
        m.lp_balance += fee;

        p.size = new;
        emit!(Traded { owner: p.owner, size_delta, new_size: new, index, fee });
        Ok(())
    }

    /// Anyone can close an under-margined position and earn the liquidation fee.
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let index = read_index(&ctx.accounts.market, &ctx.accounts.oracle)?;
        let m = &mut ctx.accounts.market;
        let p = &mut ctx.accounts.position;
        accrue_funding(m, index)?;
        settle(m, p, index)?;

        require!(p.size != 0, PerpError::NotLiquidatable);
        require!(
            i128::from(p.collateral) < margin(p.size, index, m.params.maintenance_margin_bps),
            PerpError::NotLiquidatable
        );

        let (long, short) = split(p.size);
        m.long_oi -= long;
        m.short_oi -= short;
        let closed = p.size;
        p.size = 0;

        let mut reward: u64 = 0;
        if p.collateral < 0 {
            // bad debt: the LP absorbs it
            m.lp_balance += p.collateral;
            p.collateral = 0;
        } else {
            let fee = notional(closed, index) * i128::from(m.params.liquidation_fee_bps) / BPS;
            let fee = i64::try_from(fee.min(i128::from(p.collateral))).map_err(|_| PerpError::MathOverflow)?;
            p.collateral -= fee;
            reward = fee as u64;
        }
        emit!(Liquidated { owner: p.owner, size: closed, index, reward });
        if reward > 0 {
            transfer_out(&ctx.accounts.market, &ctx.accounts.liquidator, reward)?;
        }
        Ok(())
    }

    /// Anyone can bring funding up to date (it is also done on every trade).
    pub fn crank_funding(ctx: Context<Crank>) -> Result<()> {
        let index = read_index(&ctx.accounts.market, &ctx.accounts.oracle)?;
        accrue_funding(&mut ctx.accounts.market, index)
    }
}

// ---------- maths ----------

fn to_i64(v: u64) -> Result<i64> {
    i64::try_from(v).map_err(|_| error!(PerpError::MathOverflow))
}

/// (long part, short part) of a signed size
fn split(size: i64) -> (u64, u64) {
    if size >= 0 { (size as u64, 0) } else { (0, size.unsigned_abs()) }
}

/// lamports of exposure: |size| * index / SIZE_PRECISION
pub fn notional(size: i64, index: u64) -> i128 {
    i128::from(size).abs() * i128::from(index) / SIZE_PRECISION
}

pub fn margin(size: i64, index: u64, bps: u16) -> i128 {
    notional(size, index) * i128::from(bps) / BPS
}

fn read_index(market: &Market, oracle: &Oracle) -> Result<u64> {
    let slot = Clock::get()?.slot;
    require!(oracle.index > 0, PerpError::OracleNotReady);
    require!(
        slot.saturating_sub(oracle.last_update_slot) <= market.params.max_staleness_slots,
        PerpError::StaleOracle
    );
    Ok(oracle.index)
}

/// Adds funding since the last accrual. Rate per day = max_funding_bps_per_day * skew / max_skew (capped at ±1).
/// Positive skew (more longs) -> cumulative goes up -> longs pay, shorts receive.
fn accrue_funding(m: &mut Market, index: u64) -> Result<()> {
    let slot = Clock::get()?.slot;
    let elapsed = i128::from(slot.saturating_sub(m.last_funding_slot)).min(SLOTS_PER_DAY);
    m.last_funding_slot = slot;
    if elapsed == 0 || m.params.max_skew == 0 {
        return Ok(());
    }
    let max_skew = i128::from(m.params.max_skew);
    let skew = (i128::from(m.long_oi) - i128::from(m.short_oi)).clamp(-max_skew, max_skew);
    let delta = i128::from(index)
        .checked_mul(FUNDING_PRECISION)
        .and_then(|v| v.checked_mul(i128::from(m.params.max_funding_bps_per_day)))
        .and_then(|v| v.checked_mul(skew))
        .and_then(|v| v.checked_mul(elapsed))
        .ok_or(PerpError::MathOverflow)?
        / (BPS * SLOTS_PER_DAY * max_skew);
    m.cumulative_funding = m.cumulative_funding.checked_add(delta).ok_or(PerpError::MathOverflow)?;
    Ok(())
}

/// Marks the position to `index`: PnL and funding move between the trader and the LP.
fn settle(m: &mut Market, p: &mut Position, index: u64) -> Result<()> {
    let size = i128::from(p.size);
    let pnl = if p.size == 0 { 0 } else { size * (i128::from(index) - i128::from(p.entry_index)) / SIZE_PRECISION };
    let funding = size * (m.cumulative_funding - p.last_cumulative_funding) / (SIZE_PRECISION * FUNDING_PRECISION);
    let change = i64::try_from(pnl - funding).map_err(|_| PerpError::MathOverflow)?;
    p.collateral = p.collateral.checked_add(change).ok_or(PerpError::MathOverflow)?;
    m.lp_balance = m.lp_balance.checked_sub(change).ok_or(PerpError::MathOverflow)?;
    p.entry_index = index;
    p.last_cumulative_funding = m.cumulative_funding;
    Ok(())
}

// ---------- lamport moves ----------

fn transfer_in<'info>(
    from: &Signer<'info>,
    market: &Account<'info, Market>,
    system: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            system.to_account_info(),
            system_program::Transfer { from: from.to_account_info(), to: market.to_account_info() },
        ),
        amount,
    )
}

/// The market account is owned by this program, so lamports can be moved out directly.
fn transfer_out<'info>(market: &Account<'info, Market>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    let info = market.to_account_info();
    let rent = Rent::get()?.minimum_balance(info.data_len());
    require!(info.lamports().saturating_sub(amount) >= rent, PerpError::InsufficientVault);
    info.sub_lamports(amount)?;
    to.add_lamports(amount)?;
    Ok(())
}

// ---------- accounts ----------

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(init, payer = admin, space = 8 + Market::INIT_SPACE, seeds = [b"market"], bump)]
    pub market: Account<'info, Market>,
    pub oracle: Account<'info, Oracle>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"market"], bump = market.bump, has_one = admin)]
    pub market: Account<'info, Market>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminTransfer<'info> {
    #[account(mut, seeds = [b"market"], bump = market.bump, has_one = admin)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(seeds = [b"market"], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(init, payer = owner, space = 8 + Position::INIT_SPACE,
              seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"market"], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
              bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(mut, seeds = [b"market"], bump = market.bump, has_one = oracle)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
              bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    pub oracle: Account<'info, Oracle>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut, seeds = [b"market"], bump = market.bump, has_one = oracle)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"position", market.key().as_ref(), position.owner.as_ref()],
              bump = position.bump)]
    pub position: Account<'info, Position>,
    pub oracle: Account<'info, Oracle>,
    #[account(mut)]
    pub liquidator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Crank<'info> {
    #[account(mut, seeds = [b"market"], bump = market.bump, has_one = oracle)]
    pub market: Account<'info, Market>,
    pub oracle: Account<'info, Oracle>,
}

// ---------- state ----------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct MarketParams {
    pub initial_margin_bps: u16,       // e.g. 5000 = 50% (the index can spike 10x+)
    pub maintenance_margin_bps: u16,   // below this anyone can liquidate
    pub liquidation_fee_bps: u16,      // share of notional paid to the liquidator
    pub taker_fee_bps: u16,            // paid to the LP on every trade
    pub max_funding_bps_per_day: u16,  // funding rate at full skew
    pub max_position_size: u64,        // per position, in size units
    pub max_skew: u64,                 // |long OI - short OI| cap, in size units
    pub max_staleness_slots: u64,      // reject oracle values older than this
}

impl MarketParams {
    fn validate(&self) -> Result<()> {
        require!(
            self.maintenance_margin_bps > 0
                && self.maintenance_margin_bps <= self.initial_margin_bps
                && i128::from(self.initial_margin_bps) <= BPS
                && self.liquidation_fee_bps < self.maintenance_margin_bps
                && self.max_skew > 0
                && self.max_position_size > 0
                && self.max_position_size <= i64::MAX as u64,
            PerpError::BadParams
        );
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub params: MarketParams,
    pub lp_balance: i64,          // LP's claim on the vault, lamports
    pub long_oi: u64,
    pub short_oi: u64,
    pub cumulative_funding: i128, // lamports per SIZE_PRECISION, scaled by FUNDING_PRECISION
    pub last_funding_slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral: i64, // lamports; can go negative before liquidation
    pub size: i64,       // + long, - short, in size units
    pub entry_index: u64,
    pub last_cumulative_funding: i128,
    pub bump: u8,
}

#[event]
pub struct Traded {
    pub owner: Pubkey,
    pub size_delta: i64,
    pub new_size: i64,
    pub index: u64,
    pub fee: i64,
}

#[event]
pub struct Liquidated {
    pub owner: Pubkey,
    pub size: i64,
    pub index: u64,
    pub reward: u64,
}

#[error_code]
pub enum PerpError {
    #[msg("Invalid market parameters")]
    BadParams,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Oracle has no index yet")]
    OracleNotReady,
    #[msg("Oracle index is stale")]
    StaleOracle,
    #[msg("Not enough collateral")]
    InsufficientCollateral,
    #[msg("Position would be below initial margin")]
    InsufficientMargin,
    #[msg("Position size above the per-position limit")]
    PositionLimit,
    #[msg("Trade would push long/short skew above the cap")]
    SkewLimit,
    #[msg("Liquidity pool too small")]
    InsufficientLp,
    #[msg("Vault would drop below rent-exempt minimum")]
    InsufficientVault,
    #[msg("Position is not below maintenance margin")]
    NotLiquidatable,
}
