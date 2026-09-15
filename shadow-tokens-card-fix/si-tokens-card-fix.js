/* Shadow Intelligence — Tokens Card Fix v2.6.3
   Fixes:
   - 1M percent recovery from live price samples while Tokens is open
   - visible token Age on every token card
   - no server.mjs surgery; safe overlay after app.js
*/
(() => {
  const SAMPLE_MAX_AGE_MS = 4 * 60 * 1000;
  const ONE_MIN_MIN_MS = 55 * 1000;
  const ONE_MIN_MAX_MS = 180 * 1000;
  const REFRESH_MS = 65000;
  const minuteHistory = new Map();

  function finiteNumber(v){
    if(v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function tokenKey(t){
    return String(t?.mint || t?.id || '').trim();
  }

  function currentPrice(t){
    return finiteNumber(
      t?.price_usd ??
      t?.priceUsd ??
      t?.market_price_usd ??
      t?.marketPriceUsd
    );
  }

  function sampleRows(rows){
    const now = Date.now();

    for(const token of Array.isArray(rows) ? rows : []){
      const key = tokenKey(token);
      const price = currentPrice(token);
      if(!key || price == null || price <= 0) continue;

      const list = minuteHistory.get(key) || [];
      const last = list[list.length - 1];

      // Keep one sample for each meaningfully newer server snapshot/refresh.
      if(!last || now - last.at >= 10000 || Math.abs(last.price - price) > Math.max(1e-12, price * 1e-10)){
        list.push({at: now, price});
      }

      const floor = now - SAMPLE_MAX_AGE_MS;
      while(list.length && list[0].at < floor) list.shift();
      minuteHistory.set(key, list);
    }
  }

  function oneMinutePct(token){
    const key = tokenKey(token);
    const nowPrice = currentPrice(token);
    if(!key || nowPrice == null || nowPrice <= 0) return null;

    const list = minuteHistory.get(key) || [];
    const now = Date.now();

    // Pick the newest sample that is at least ~1 minute old,
    // but never use a stale sample older than 3 minutes.
    let base = null;
    for(let i = list.length - 1; i >= 0; i--){
      const age = now - list[i].at;
      if(age >= ONE_MIN_MIN_MS && age <= ONE_MIN_MAX_MS){
        base = list[i];
        break;
      }
    }

    if(!base || base.price <= 0) return null;
    return ((nowPrice - base.price) / base.price) * 100;
  }

  function ageTimestamp(token){
    const candidates = [
      token?.token_market_created_at,
      token?.market_created_at,
      token?.pair_created_at,
      token?.pairCreatedAt,
      token?.marketCreatedAt
    ];

    for(const value of candidates){
      if(!value) continue;
      const n = Number(value);
      if(Number.isFinite(n) && n > 0){
        const ms = n < 1e12 ? n * 1000 : n;
        if(Number.isFinite(ms)) return ms;
      }
      const parsed = Date.parse(value);
      if(Number.isFinite(parsed)) return parsed;
    }

    return 0;
  }

  function ageLabel(token){
    const created = ageTimestamp(token);
    if(!created) return '—';

    const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
    if(minutes < 1) return '<1m';
    if(minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if(days < 30) return `${days}d`;

    const months = Math.floor(days / 30);
    if(months < 12) return `${months}mo`;

    return `${Math.floor(days / 365)}y`;
  }

  // Override only the 1M branch; preserve server values for all other periods.
  if(typeof tokenChangeForMode === 'function'){
    const originalTokenChangeForMode = tokenChangeForMode;

    tokenChangeForMode = function(token, mode = tokenSortMode){
      if(mode === 'm1'){
        const calculated = oneMinutePct(token);
        if(calculated != null) return calculated;

        // If the server already has a valid 1M value, use it.
        const server1m = finiteNumber(token?.price_change_1m);
        return server1m;
      }

      return originalTokenChangeForMode(token, mode);
    };
  }

  if(typeof tokenAgeTimestamp === 'function'){
    tokenAgeTimestamp = function(token){
      return ageTimestamp(token);
    };
  }

  function renderFixedTokens(){
    if(typeof ensureTokenSortControls !== 'function' ||
       typeof sortedTokenRows !== 'function' ||
       typeof siTokenAvatarHtml !== 'function') return;

    ensureTokenSortControls();
    sampleRows(state?.tokens);

    const a = sortedTokenRows(state?.tokens);
    const periodMode = ['m1','m5','h1','h6','h24'].includes(tokenSortMode);
    const grid = document.querySelector('#tokensGrid');
    if(!grid) return;

    grid.innerHTML = a.map(t => {
      const raw = periodMode ? tokenChangeForMode(t) : t.price_change_1h;
      const change = raw == null ? null : Number(raw);
      const known = Number.isFinite(change);
      const changeClass = !known ? '' : change >= 0 ? 'pos' : 'neg';
      const changeText = !known ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;

      return `<article class="si-panel si-token-card" data-token="${esc(t.mint)}">
        ${siTokenAvatarHtml(t)}
        <div>
          <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
          <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
          <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${ageLabel(t)} · MC ${money(t.market_cap||0)}</small>
        </div>
        <strong class="${changeClass}">${changeText}</strong>
      </article>`;
    }).join('') || '<div class="guest-note">Tokens appear after observed activity.</div>';

    $$('[data-token]').forEach(x => x.onclick = event => {
      if(event.target.closest('[data-pump-token-link]')) return;
      openObject('token',{mint:x.dataset.token});
    });

    ensureTokenSortControls();
  }

  if(typeof renderTokens === 'function'){
    renderTokens = renderFixedTokens;
  }

  let refreshing = false;
  async function refreshTokens(){
    const grid = document.querySelector('#tokensGrid');
    if(document.hidden || !grid || grid.offsetParent === null || refreshing) return;

    refreshing = true;
    try{
      const data = await api('/api/tokens');
      if(Array.isArray(data?.items)){
        sampleRows(state?.tokens);
        state.tokens = data.items;
        sampleRows(state.tokens);
        renderFixedTokens();
      }
    }catch(error){
      console.debug('Tokens live refresh unavailable', error);
    }finally{
      refreshing = false;
    }
  }

  // Seed immediately from current state.
  try{
    sampleRows(state?.tokens);
    if(document.querySelector('#tokensGrid')) renderFixedTokens();
  }catch(error){
    console.debug('Tokens card fix init skipped', error);
  }

  setInterval(refreshTokens, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) refreshTokens();
  });
  window.addEventListener('pageshow', refreshTokens);
})();
