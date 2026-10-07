from pathlib import Path

dbp=Path("src/db.mjs")
srv=Path("server.mjs")
engp=Path("src/internal-copy-engine.mjs")
for p in (dbp,srv,engp):
    if not p.exists(): raise SystemExit(f"ERROR: missing {p}")

db=dbp.read_text()
s=srv.read_text()
e=engp.read_text()

def repl(text, old, new, label, optional=False):
    if new in text: return text
    if old not in text:
        if optional:
            print(f"SKIP: {label} anchor differs in this revision")
            return text
        raise SystemExit(f"ERROR: {label} anchor not found")
    return text.replace(old,new,1)

db=repl(db,
"""      max_market_cap_usd REAL NOT NULL DEFAULT 0,
      copy_buys INTEGER NOT NULL DEFAULT 1,""",
"""      max_market_cap_usd REAL NOT NULL DEFAULT 0,
      take_profit_enabled INTEGER NOT NULL DEFAULT 0,
      take_profit_percent REAL NOT NULL DEFAULT 100,
      stop_loss_enabled INTEGER NOT NULL DEFAULT 0,
      stop_loss_percent REAL NOT NULL DEFAULT 30,
      copy_buys INTEGER NOT NULL DEFAULT 1,""","db schema")

db=repl(db,
"""  addColumn(db,'copy_subscriptions',"max_market_cap_usd REAL NOT NULL DEFAULT 0");
  /* SHADOW_COPY_MC_RANGE_V360_DB_END */""",
"""  addColumn(db,'copy_subscriptions',"max_market_cap_usd REAL NOT NULL DEFAULT 0");
  /* SHADOW_COPY_MC_RANGE_V360_DB_END */
  /* SYNC_TP_SL_BACKEND_V2 */
  addColumn(db,'copy_subscriptions',"take_profit_enabled INTEGER NOT NULL DEFAULT 0");
  addColumn(db,'copy_subscriptions',"take_profit_percent REAL NOT NULL DEFAULT 100");
  addColumn(db,'copy_subscriptions',"stop_loss_enabled INTEGER NOT NULL DEFAULT 0");
  addColumn(db,'copy_subscriptions',"stop_loss_percent REAL NOT NULL DEFAULT 30");
  /* SYNC_TP_SL_BACKEND_V2_END */""","db migration")

s=repl(s,
"""    maxMarketCapUsd:Number(row.max_market_cap_usd||0),
    sellPercent:row.sell_percent,""",
"""    maxMarketCapUsd:Number(row.max_market_cap_usd||0),
    takeProfitEnabled:!!row.take_profit_enabled,
    takeProfitPercent:Number(row.take_profit_percent||100),
    stopLossEnabled:!!row.stop_loss_enabled,
    stopLossPercent:Number(row.stop_loss_percent||30),
    sellPercent:row.sell_percent,""","api output")

s=repl(s,
"""    const copyBuys=b.copyBuys!==false?1:0;
    const copySells=b.copySells!==false?1:0;""",
"""    const takeProfitEnabled=b.takeProfitEnabled===true?1:0;
    const takeProfitPercent=numBetween(b.takeProfitPercent,1,10000,100);
    const stopLossEnabled=b.stopLossEnabled===true?1:0;
    const stopLossPercent=numBetween(b.stopLossPercent,1,99,30);
    const copyBuys=b.copyBuys!==false?1:0;
    const copySells=b.copySells!==false?1:0;""","request parsing")

s=repl(s,
"""          slippage_bps=?,min_market_cap_usd=?,max_market_cap_usd=?,
          copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?""",
"""          slippage_bps=?,min_market_cap_usd=?,max_market_cap_usd=?,
          take_profit_enabled=?,take_profit_percent=?,stop_loss_enabled=?,stop_loss_percent=?,
          copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?""","update sql")

s=repl(s,
"""        slippageBps,minMarketCapUsd,maxMarketCapUsd,
        copyBuys,copySells,sellPercent,at,subId,user.id""",
"""        slippageBps,minMarketCapUsd,maxMarketCapUsd,
        takeProfitEnabled,takeProfitPercent,stopLossEnabled,stopLossPercent,
        copyBuys,copySells,sellPercent,at,subId,user.id""","update args")

s=repl(s,
"""           slippage_bps,min_market_cap_usd,max_market_cap_usd,copy_buys,copy_sells,sell_percent,
           engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,'draft','',?,?)""",
"""           slippage_bps,min_market_cap_usd,max_market_cap_usd,
           take_profit_enabled,take_profit_percent,stop_loss_enabled,stop_loss_percent,
           copy_buys,copy_sells,sell_percent,engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft','',?,?)""","insert sql")

s=repl(s,
"""        minMarketCapUsd,maxMarketCapUsd,copyBuys,copySells,sellPercent,
        at,at""",
"""        minMarketCapUsd,maxMarketCapUsd,
        takeProfitEnabled,takeProfitPercent,stopLossEnabled,stopLossPercent,
        copyBuys,copySells,sellPercent,at,at""","insert args")

# Engine details are useful but optional because local Replit engine revision may differ.
e=repl(e,
"""      minMarketCapUsd:Number(sub.min_market_cap_usd||0),maxMarketCapUsd:Number(sub.max_market_cap_usd||0),
      buyMarketCapFilter:buyMarketCapFilter(sub),copyBuys:!!sub.copy_buys,""",
"""      minMarketCapUsd:Number(sub.min_market_cap_usd||0),maxMarketCapUsd:Number(sub.max_market_cap_usd||0),
      takeProfitEnabled:!!sub.take_profit_enabled,takeProfitPercent:Number(sub.take_profit_percent||100),
      stopLossEnabled:!!sub.stop_loss_enabled,stopLossPercent:Number(sub.stop_loss_percent||30),
      buyMarketCapFilter:buyMarketCapFilter(sub),copyBuys:!!sub.copy_buys,""","engine details",optional=True)

# No brittle engine snapshot edit in V2.
dbp.write_text(db); srv.write_text(s); engp.write_text(e)
print("SYNC TP/SL BACKEND V2 INSTALLED")
