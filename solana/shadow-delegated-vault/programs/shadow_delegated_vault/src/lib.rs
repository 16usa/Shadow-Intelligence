use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed, pubkey};
use anchor_spl::token::TokenAccount;

declare_id!("H2LRaXnCHp5qc2MECPFLuAVWcFwYqQTi1TgJZJT3tDQc");

const WSOL: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
const JUPITER_V6: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const ROUTE_DISC: [u8;8] = [229,23,203,151,122,227,173,42];
const SHARED_ROUTE_DISC: [u8;8] = [193,32,155,51,65,214,156,129];
const EXACT_OUT_DISC: [u8;8] = [208,51,239,151,123,43,237,92];

#[program]
pub mod shadow_delegated_vault {
    use super::*;

    pub fn initialize_policy(ctx: Context<InitializePolicy>, subscription_hash: [u8;32], session_key: Pubkey,
        expires_at: i64, max_trade_lamports: u64, daily_cap_lamports: u64, max_sell_bps: u16,
        copy_buys: bool, copy_sells: bool) -> Result<()> {
        require!(expires_at > Clock::get()?.unix_timestamp, ErrorCode::InvalidExpiry);
        require!(max_trade_lamports > 0 && daily_cap_lamports >= max_trade_lamports, ErrorCode::InvalidLimit);
        require!(max_sell_bps <= 10_000, ErrorCode::InvalidLimit);
        let p=&mut ctx.accounts.policy;
        p.owner=ctx.accounts.owner.key();p.session_key=session_key;p.subscription_hash=subscription_hash;
        p.expires_at=expires_at;p.max_trade_lamports=max_trade_lamports;p.daily_cap_lamports=daily_cap_lamports;
        p.max_sell_bps=max_sell_bps;p.copy_buys=copy_buys;p.copy_sells=copy_sells;p.revoked=false;
        p.day_index=current_day()?;p.spent_today_lamports=0;p.policy_bump=ctx.bumps.policy;p.vault_bump=ctx.bumps.vault;
        Ok(())
    }

    pub fn revoke_session(ctx: Context<OwnerPolicy>) -> Result<()> {
        ctx.accounts.policy.revoked=true;ctx.accounts.policy.session_key=Pubkey::default();Ok(())
    }

    pub fn withdraw_sol(ctx: Context<WithdrawSol>, lamports: u64) -> Result<()> {
        require!(lamports>0,ErrorCode::InvalidLimit);
        let ix=anchor_lang::solana_program::system_instruction::transfer(&ctx.accounts.vault.key(),&ctx.accounts.owner.key(),lamports);
        let policy_key=ctx.accounts.policy.key();
        let vault_bump=[ctx.accounts.policy.vault_bump];
        let seeds:&[&[u8]]=&[b"vault",policy_key.as_ref(),&vault_bump];
        invoke_signed(&ix,&[ctx.accounts.vault.to_account_info(),ctx.accounts.owner.to_account_info(),ctx.accounts.system_program.to_account_info()],&[seeds])?;
        Ok(())
    }

    /// Executes one Jupiter swap through the vault PDA. The backend session key
    /// signs the outer instruction; the vault PDA signs only the inner Jupiter
    /// transfer authority. Source/destination token accounts must belong to the
    /// vault and no other vault-owned writable token account may be supplied.
    pub fn execute_swap(ctx: Context<ExecuteSwap>, side: u8, max_input_amount: u64, jupiter_ix_data: Vec<u8>) -> Result<()> {
        let policy_key=ctx.accounts.policy.key();
        let p=&mut ctx.accounts.policy;let clock=Clock::get()?;
        require!(!p.revoked,ErrorCode::Revoked);require!(clock.unix_timestamp<=p.expires_at,ErrorCode::Expired);
        require_keys_eq!(p.session_key,ctx.accounts.session.key(),ErrorCode::WrongSession);
        require_keys_eq!(ctx.accounts.jupiter_program.key(),JUPITER_V6,ErrorCode::WrongProgram);
        require!(jupiter_ix_data.len()>=8,ErrorCode::WrongInstruction);
        let disc:&[u8;8]=jupiter_ix_data[0..8].try_into().map_err(|_|error!(ErrorCode::WrongInstruction))?;
        require!(*disc==ROUTE_DISC||*disc==SHARED_ROUTE_DISC||*disc==EXACT_OUT_DISC,ErrorCode::WrongInstruction);
        require_keys_eq!(ctx.accounts.source.owner,ctx.accounts.vault.key(),ErrorCode::WrongVaultTokenOwner);
        require_keys_eq!(ctx.accounts.destination.owner,ctx.accounts.vault.key(),ErrorCode::WrongVaultTokenOwner);
        let source_before=ctx.accounts.source.amount;let dest_before=ctx.accounts.destination.amount;
        if side==0 {require!(p.copy_buys,ErrorCode::SideDisabled);require_keys_eq!(ctx.accounts.source.mint,WSOL,ErrorCode::BuyMustSpendWsol);require!(max_input_amount<=p.max_trade_lamports,ErrorCode::TradeCap);roll_day(p)?;require!(p.spent_today_lamports.saturating_add(max_input_amount)<=p.daily_cap_lamports,ErrorCode::DailyCap)}
        else if side==1 {require!(p.copy_sells,ErrorCode::SideDisabled);require_keys_eq!(ctx.accounts.destination.mint,WSOL,ErrorCode::SellMustReturnWsol);let allowed=((source_before as u128)*(p.max_sell_bps as u128)/10_000u128) as u64;require!(max_input_amount<=allowed,ErrorCode::SellCap)}
        else {return err!(ErrorCode::InvalidSide)}

        // Any writable SPL token account owned by this vault must be one of the
        // two accounts explicitly policy-checked above. This prevents a scoped
        // session from smuggling another vault holding into a Jupiter route.
        for ai in ctx.remaining_accounts.iter(){
            if ai.is_writable && *ai.owner==anchor_spl::token::ID {
                if let Ok(t)=TokenAccount::try_deserialize(&mut &ai.data.borrow()[..]){
                    if t.owner==ctx.accounts.vault.key(){require!(ai.key()==ctx.accounts.source.key()||ai.key()==ctx.accounts.destination.key(),ErrorCode::UnexpectedVaultAccount)}
                }
            }
        }
        let mut metas=Vec::with_capacity(ctx.remaining_accounts.len());
        for ai in ctx.remaining_accounts.iter(){let signer=ai.key()==ctx.accounts.vault.key();metas.push(if ai.is_writable{AccountMeta::new(ai.key(),signer)}else{AccountMeta::new_readonly(ai.key(),signer)})}
        let ix=Instruction{program_id:JUPITER_V6,accounts:metas,data:jupiter_ix_data};
        let vault_bump=[p.vault_bump];
        let vault_seeds:&[&[u8]]=&[b"vault",policy_key.as_ref(),&vault_bump];
        let mut infos:Vec<AccountInfo>=ctx.remaining_accounts.iter().cloned().collect();infos.push(ctx.accounts.jupiter_program.to_account_info());
        invoke_signed(&ix,&infos,&[vault_seeds])?;
        ctx.accounts.source.reload()?;ctx.accounts.destination.reload()?;
        let actual=source_before.saturating_sub(ctx.accounts.source.amount);require!(actual<=max_input_amount,ErrorCode::InputExceeded);require!(ctx.accounts.destination.amount>=dest_before,ErrorCode::DestinationDecreased);
        if side==0 {roll_day(p)?;p.spent_today_lamports=p.spent_today_lamports.checked_add(actual).ok_or(ErrorCode::Math)?;require!(p.spent_today_lamports<=p.daily_cap_lamports,ErrorCode::DailyCap)}
        Ok(())
    }
}

fn current_day()->Result<i64>{Ok(Clock::get()?.unix_timestamp.div_euclid(86_400))}
fn roll_day(p:&mut Account<Policy>)->Result<()> {let d=current_day()?;if p.day_index!=d{p.day_index=d;p.spent_today_lamports=0}Ok(())}

#[derive(Accounts)]
#[instruction(subscription_hash:[u8;32])]
pub struct InitializePolicy<'info>{
    #[account(mut)] pub owner: Signer<'info>,
    #[account(init,payer=owner,space=8+Policy::INIT_SPACE,seeds=[b"policy",owner.key().as_ref(),subscription_hash.as_ref()],bump)] pub policy: Account<'info,Policy>,
    /// CHECK: key-only PDA, intentionally no private key or state account.
    #[account(seeds=[b"vault",policy.key().as_ref()],bump)] pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info,System>,
}
#[derive(Accounts)]
pub struct OwnerPolicy<'info>{
    pub owner: Signer<'info>,
    #[account(mut,has_one=owner)] pub policy: Account<'info,Policy>,
}
#[derive(Accounts)]
pub struct WithdrawSol<'info>{
    #[account(mut)] pub owner: Signer<'info>,
    #[account(has_one=owner)] pub policy: Account<'info,Policy>,
    /// CHECK: PDA signs through invoke_signed.
    #[account(mut,seeds=[b"vault",policy.key().as_ref()],bump=policy.vault_bump)] pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info,System>,
}
#[derive(Accounts)]
pub struct ExecuteSwap<'info>{
    pub session: Signer<'info>,
    #[account(mut)] pub policy: Account<'info,Policy>,
    /// CHECK: PDA transfer authority for vault-owned token accounts.
    #[account(seeds=[b"vault",policy.key().as_ref()],bump=policy.vault_bump)] pub vault: UncheckedAccount<'info>,
    #[account(mut)] pub source: Account<'info,TokenAccount>,
    #[account(mut)] pub destination: Account<'info,TokenAccount>,
    /// CHECK: exact Jupiter program id checked in handler.
    #[account(executable)] pub jupiter_program: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Policy{
    pub owner:Pubkey,pub session_key:Pubkey,pub subscription_hash:[u8;32],pub expires_at:i64,
    pub max_trade_lamports:u64,pub daily_cap_lamports:u64,pub spent_today_lamports:u64,pub day_index:i64,
    pub max_sell_bps:u16,pub copy_buys:bool,pub copy_sells:bool,pub revoked:bool,pub policy_bump:u8,pub vault_bump:u8,
}
#[error_code]
pub enum ErrorCode{
    #[msg("Invalid expiry")]InvalidExpiry,#[msg("Invalid limit")]InvalidLimit,#[msg("Session revoked")]Revoked,
    #[msg("Session expired")]Expired,#[msg("Wrong session key")]WrongSession,#[msg("Wrong program")]WrongProgram,
    #[msg("Unsupported swap instruction")]WrongInstruction,#[msg("Token account is not owned by delegated vault")]WrongVaultTokenOwner,
    #[msg("Copy side disabled")]SideDisabled,#[msg("BUY must spend WSOL")]BuyMustSpendWsol,#[msg("SELL must return WSOL")]SellMustReturnWsol,
    #[msg("Per-trade cap exceeded")]TradeCap,#[msg("Daily cap exceeded")]DailyCap,#[msg("SELL percent cap exceeded")]SellCap,
    #[msg("Invalid side")]InvalidSide,#[msg("Unexpected vault-owned account in route")]UnexpectedVaultAccount,
    #[msg("Actual swap input exceeded authorized maximum")]InputExceeded,#[msg("Destination balance decreased")]DestinationDecreased,#[msg("Math overflow")]Math,
}
