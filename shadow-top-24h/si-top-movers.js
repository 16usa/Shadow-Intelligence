/* Shadow Intelligence — Top 24H Movers v2.5.0 */
(() => {
  const ROOT_ID = 'siTopMovers24h';
  const REFRESH_MS = 120000;
  let timer = 0;
  let loading = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function priceText(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n <= 0) return '—';
    if(n >= 1000) return '$' + n.toLocaleString(undefined,{maximumFractionDigits:2});
    if(n >= 1) return '$' + n.toFixed(2);
    if(n >= .01) return '$' + n.toFixed(4);
    if(n >= .0001) return '$' + n.toFixed(6);
    return '$' + n.toPrecision(4);
  }

  function symbolText(value){
    const s = String(value || 'TOKEN').trim();
    return s.startsWith('$') ? s : '$' + s;
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
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
    return `<svg class="si-mover-spark ${positive ? 'is-positive' : 'is-negative'}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function cardHtml(item){
    const change = Number(item.change24h || 0);
    const positive = change >= 0;
    const image = String(item.image || '').trim();
    const imageHtml = image
      ? `<img class="si-mover-avatar" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`
      : `<span class="si-mover-avatar si-mover-avatar-fallback">${escapeHtml(symbolText(item.symbol).replace('$','').slice(0,2))}</span>`;

    return `<button type="button" class="si-mover-card" data-mover-mint="${escapeHtml(item.mint)}" aria-label="${escapeHtml(symbolText(item.symbol))}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)} percent in 24 hours">
      ${imageHtml}
      <span class="si-mover-copy">
        <span class="si-mover-symbol">${escapeHtml(symbolText(item.symbol))}</span>
        <span class="si-mover-name">${escapeHtml(item.name || 'Tracked token')}</span>
        <span class="si-mover-market">
          <strong>${escapeHtml(priceText(item.priceUsd))}</strong>
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
    root.innerHTML = `
      <div class="si-movers-caption"><span>24H MOVERS</span><small>tracked live</small></div>
      <div class="si-movers-track" role="list"></div>
    `;
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

    root.querySelectorAll('.si-mover-avatar').forEach(img => {
      if(img.tagName !== 'IMG') return;
      img.onerror = () => {
        const fallback = document.createElement('span');
        fallback.className = 'si-mover-avatar si-mover-avatar-fallback';
        fallback.textContent = '$';
        img.replaceWith(fallback);
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
