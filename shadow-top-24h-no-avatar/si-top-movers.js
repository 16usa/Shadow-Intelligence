/* Shadow Intelligence — Top 24H Movers v2.5.3 */
(() => {
  const ROOT_ID = 'siTopMovers24h';
  const REFRESH_MS = 120000;
  let timer = 0;
  let loading = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function symbolText(value){
    const s = String(value || 'TOKEN').trim();
    return s.startsWith('$') ? s : '$' + s;
  }

  function compactMoney(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n <= 0) return '—';
    const a = Math.abs(n);
    if(a >= 1e9) return '$' + (a/1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    if(a >= 1e6) return '$' + (a/1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if(a >= 1e3) return '$' + (a/1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    return '$' + a.toFixed(0);
  }

  function sparklineSvg(values, positive){
    const nums = (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0);

    if(nums.length < 2){
      return '<svg class="si-mover-spark is-empty" viewBox="0 0 96 44" aria-hidden="true"><path d="M3 22H93"/></svg>';
    }

    const width = 96, height = 44, px = 3, py = 4;
    let min = Math.min(...nums), max = Math.max(...nums);

    if(max - min < Math.max(1e-12, Math.abs(max) * 0.000001)){
      min -= Math.abs(min || 1) * .01;
      max += Math.abs(max || 1) * .01;
    }

    const span = max - min || 1;
    const step = (width - px * 2) / Math.max(1, nums.length - 1);
    const points = nums.map((n, i) => {
      const x = px + step * i;
      const y = py + (1 - (n - min) / span) * (height - py * 2);
      return [x, y];
    });

    const d = points
      .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
      .join(' ');

    return `<svg class="si-mover-spark ${positive ? 'is-positive' : 'is-negative'}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function cardHtml(item){
    const change = Number(item.change24h || 0);
    const positive = change >= 0;

    return `<button type="button" class="si-mover-card" data-mover-mint="${escapeHtml(item.mint)}" aria-label="${escapeHtml(symbolText(item.symbol))}, market cap ${escapeHtml(compactMoney(item.marketCap))}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)} percent in 24 hours">
      <span class="si-mover-copy">
        <span class="si-mover-symbol">${escapeHtml(symbolText(item.symbol))}</span>
        <span class="si-mover-market">
          <span class="si-mover-mc">MC ${escapeHtml(compactMoney(item.marketCap))}</span>
          <b class="${positive ? 'pos' : 'neg'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</b>
        </span>
      </span>
      <span class="si-mover-chart">${sparklineSvg(item.sparkline, positive)}</span>
    </button>`;
  }

  function ensureRoot(){
    let root = document.getElementById(ROOT_ID);
    if(root) return root;

    const page = document.getElementById('page-overview');
    if(!page) return null;

    root = document.createElement('section');
    root.id = ROOT_ID;
    root.className = 'si-top-movers24h';
    root.hidden = true;
    root.setAttribute('aria-label','Top token movers in the last 24 hours');
    root.innerHTML = '<div class="si-movers-track" role="list"></div>';
    page.appendChild(root);
    return root;
  }

  function bindCards(root){
    root.querySelectorAll('[data-mover-mint]').forEach(card => {
      card.onclick = () => {
        const mint = card.dataset.moverMint;
        try{
          if(typeof openObject === 'function'){
            openObject('token',{mint});
            return;
          }
        }catch{}
        try{
          const tokenButton = document.querySelector(`[data-token="${CSS.escape(mint)}"]`);
          if(tokenButton) tokenButton.click();
        }catch{}
      };
    });
  }

  async function load(){
    if(loading || document.hidden) return;

    const root = ensureRoot();
    if(!root) return;

    loading = true;
    try{
      const response = await fetch('/api/market/movers', {
        headers:{accept:'application/json'},
        cache:'no-store'
      });

      if(!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const track = root.querySelector('.si-movers-track');

      if(!items.length){
        root.hidden = true;
        track.innerHTML = '';
        return;
      }

      // Backend already sorts descending by 24h growth.
      // Keep the strongest mover nearest to the bell/right side.
      track.innerHTML = items.map(cardHtml).join('');
      root.hidden = false;
      bindCards(root);
    }catch(error){
      console.debug('24H movers unavailable:', error);
    }finally{
      loading = false;
    }
  }

  function start(){
    ensureRoot();
    load();
    clearInterval(timer);
    timer = setInterval(load, REFRESH_MS);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, {once:true});
  }else{
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) load();
  });

  window.addEventListener('pageshow', load);
})();
