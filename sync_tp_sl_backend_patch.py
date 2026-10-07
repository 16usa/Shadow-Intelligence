from pathlib import Path

dbp=Path("src/db.mjs")
srv=Path("server.mjs")
eng=Path("src/internal-copy-engine.mjs")
for p in (dbp,srv,eng):
    if not p.exists():
        raise SystemExit(f"ERROR: missing {p}; run from project root")

db=dbp.read_text()
server=srv.read_text()
engine=eng.read_text()

# DB schema
old="""      max_market_cap_usd REAL NOT NULL DEFAULT 0,
      copy_buys INTEGER NOT NULL DEFAULT 1,"""
new="""      max_market_cap_usd REAL NOT NULL DEFAULT 0,
      take_profit_enabled INTEGER NOT NULL DEFAULT 0,
      take_profit_percent REAL NOT NULL DEFAULT 100,
      stop_loss_enabled INTEGER NOT NULL DEFAULT 0,
      stop_loss_percent REAL NOT NULL DEFAULT 30,
      copy_buys INTEGER NOT NULL DEFAULT 1,"""
if "take_profit_enabled INTEGER" not in db:
    if old not in db: raise SystemExit("ERROR: db schema anchor not found")
    db=db.replace(old,new,1)

old="""  addColumn(db,'copy_subscriptions',"max_market_cap_usd REAL NOT NULL DEFAULT 0");
  /* SHADOW_COPY_MC_RANGE_V360_DB_END */"""
new="""  addColumn(db,'copy_subscriptions',"max_market_cap_usd REAL NOT NULL DEFAULT 0");
  /* SHADOW_COPY_MC_RANGE_V360_DB_END */
  /* SYNC_TP_SL_BACKEND_V100 */
  addColumn(db,'copy_subscriptions',"take_profit_enabled INTEGER NOT NULL DEFAULT 0");
  addColumn(db,'copy_subscriptions',"take_profit_percent REAL NOT NULL DEFAULT 100");
  addColumn(db,'copy_subscriptions',"stop_loss_enabled INTEGER NOT NULL DEFAULT 0");
  addColumn(db,'copy_subscriptions',"stop_loss_percent REAL NOT NULL DEFAULT 30");
  /* SYNC_TP_SL_BACKEND_V100_END */"""
if "SYNC_TP_SL_BACKEND_V100" not in db:
    if old not in db: raise SystemExit("ERROR: db migration anchor not found")
    db=db.replace(old,new,1)

# API output
old="""    maxMarketCapUsd:Number(row.max_market_cap_usd||0),
    sellPercent:row.sell_percent,"""
new="""    maxMarketCapUsd:Number(row.max_market_cap_usd||0),
    takeProfitEnabled:!!row.take_profit_enabled,
    takeProfitPercent:Number(row.take_profit_percent||100),
    stopLossEnabled:!!row.stop_loss_enabled,
    stopLossPercent:Number(row.stop_loss_percent||30),
    sellPercent:row.sell_percent,"""
if "takeProfitEnabled:!!row.take_profit_enabled" not in server:
    if old not in server: raise SystemExit("ERROR: subscription output anchor not found")
    server=server.replace(old,new,1)

# Parse request
old="""    const copyBuys=b.copyBuys!==false?1:0;
    const copySells=b.copySells!==false?1:0;"""
new="""    const takeProfitEnabled=b.takeProfitEnabled===true?1:0;
    const takeProfitPercent=numBetween(b.takeProfitPercent,1,10000,100);
    const stopLossEnabled=b.stopLossEnabled===true?1:0;
    const stopLossPercent=numBetween(b.stopLossPercent,1,99,30);
    const copyBuys=b.copyBuys!==false?1:0;
    const copySells=b.copySells!==false?1:0;"""
if "const takeProfitEnabled=b.takeProfitEnabled" not in server:
    if old not in server: raise SystemExit("ERROR: API parse anchor not found")
    server=server.replace(old,new,1)

# UPDATE
old="""          slippage_bps=?,min_market_cap_usd=?,max_market_cap_usd=?,
          copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?"""
new="""          slippage_bps=?,min_market_cap_usd=?,max_market_cap_usd=?,
          take_profit_enabled=?,take_profit_percent=?,stop_loss_enabled=?,stop_loss_percent=?,
          copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?"""
if "take_profit_enabled=?,take_profit_percent=?" not in server:
    if old not in server: raise SystemExit("ERROR: update SQL anchor not found")
    server=server.replace(old,new,1)
    oldargs="""        slippageBps,minMarketCapUsd,maxMarketCapUsd,
        copyBuys,copySells,sellPercent,at,subId,user.id"""
    newargs="""        slippageBps,minMarketCapUsd,maxMarketCapUsd,
        takeProfitEnabled,takeProfitPercent,stopLossEnabled,stopLossPercent,
        copyBuys,copySells,sellPercent,at,subId,user.id"""
    if oldargs not in server: raise SystemExit("ERROR: update args anchor not found")
    server=server.replace(oldargs,newargs,1)

# INSERT
old="""           slippage_bps,min_market_cap_usd,max_market_cap_usd,copy_buys,copy_sells,sell_percent,
           engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,'draft','',?,?)"""
new="""           slippage_bps,min_market_cap_usd,max_market_cap_usd,
           take_profit_enabled,take_profit_percent,stop_loss_enabled,stop_loss_percent,
           copy_buys,copy_sells,sell_percent,engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft','',?,?)"""
if "take_profit_enabled,take_profit_percent,stop_loss_enabled,stop_loss_percent" not in server:
    if old not in server: raise SystemExit("ERROR: insert SQL anchor not found")
    server=server.replace(old,new,1)
    oldargs="""        minMarketCapUsd,maxMarketCapUsd,copyBuys,copySells,sellPercent,
        at,at"""
    newargs="""        minMarketCapUsd,maxMarketCapUsd,
        takeProfitEnabled,takeProfitPercent,stopLossEnabled,stopLossPercent,
        copyBuys,copySells,sellPercent,at,at"""
    if oldargs not in server: raise SystemExit("ERROR: insert args anchor not found")
    server=server.replace(oldargs,newargs,1)

# Engine authorization snapshot includes TP/SL
old="""      minMarketCapUsd:Number(sub.min_market_cap_usd||0),maxMarketCapUsd:Number(sub.max_market_cap_usd||0),
      buyMarketCapFilter:buyMarketCapFilter(sub),copyBuys:!!sub.copy_buys,"""
new="""      minMarketCapUsd:Number(sub.min_market_cap_usd||0),maxMarketCapUsd:Number(sub.max_market_cap_usd||0),
      takeProfitEnabled:!!sub.take_profit_enabled,takeProfitPercent:Number(sub.take_profit_percent||100),
      stopLossEnabled:!!sub.stop_loss_enabled,stopLossPercent:Number(sub.stop_loss_percent||30),
      buyMarketCapFilter:buyMarketCapFilter(sub),copyBuys:!!sub.copy_buys,"""
if "takeProfitEnabled:!!sub.take_profit_enabled" not in engine:
    if old not in engine: raise SystemExit("ERROR: engine details anchor not found")
    engine=engine.replace(old,new,1)

# Add fail-closed TP/SL policy visibility to status/snapshot without pretending execution exists
old="""      buyMarketCapFilter:buyMarketCapFilter(canonical),
      executionReady:false,"""
new="""      buyMarketCapFilter:buyMarketCapFilter(canonical),
      automaticExitPolicy:{
        takeProfitEnabled:!!canonical.take_profit_enabled,
        takeProfitPercent:Number(canonical.take_profit_percent||100),
        stopLossEnabled:!!canonical.stop_loss_enabled,
        stopLossPercent:Number(canonical.stop_loss_percent||30),
        entryPriceSource:'actual_copy_fill',
        firstExitWins:true,
        leaderSellEnabled:!!canonical.copy_sells,
        executionState:'waiting_for_swap_executor'
      },
      executionReady:false,"""
if "automaticExitPolicy:" not in engine:
    if old not in engine: raise SystemExit("ERROR: engine snapshot anchor not found")
    engine=engine.replace(old,new,1)

dbp.write_text(db)
srv.write_text(server)
eng.write_text(engine)
print("SYNC TP/SL BACKEND SETTINGS PATCH INSTALLED")
print("NOTE: autonomous SELL remains fail-closed because the current engine has no reviewed swap executor.")
