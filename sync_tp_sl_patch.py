from pathlib import Path

html = Path("public/sync.html")
js = Path("public/sync.js")

if not html.exists() or not js.exists():
    raise SystemExit("ERROR: run this from the Shadow-Intelligence project root")

h = html.read_text()
j = js.read_text()

anchor = """        <div class="switch-row">
          <label class="switch-line">
            <span>
              <strong>Follow buys</strong>"""

tp_sl = """        <div class="section-label">AUTOMATIC EXIT</div>

        <div class="grid-two">
          <label class="field">
            <span>Take Profit</span>
            <div class="percent-input">
              <input id="takeProfitPercent" type="number" min="1" max="10000" step="1" inputmode="decimal" value="100">
              <span>%</span>
            </div>
          </label>

          <label class="field">
            <span>Stop Loss</span>
            <div class="percent-input">
              <input id="stopLossPercent" type="number" min="1" max="99" step="1" inputmode="decimal" value="30">
              <span>%</span>
            </div>
          </label>
        </div>

        <div class="switch-row">
          <label class="switch-line">
            <span>
              <strong>Take Profit</strong>
              <small>Auto sell when profit target is reached</small>
            </span>
            <input id="takeProfitEnabled" type="checkbox" checked>
            <i></i>
          </label>

          <label class="switch-line">
            <span>
              <strong>Stop Loss</strong>
              <small>Auto sell when loss limit is reached</small>
            </span>
            <input id="stopLossEnabled" type="checkbox" checked>
            <i></i>
          </label>
        </div>

        <div class="switch-row">
          <label class="switch-line">
            <span>
              <strong>Follow buys</strong>"""

if 'id="takeProfitPercent"' not in h:
    if anchor not in h:
        raise SystemExit("ERROR: sync.html insertion point not found")
    h = h.replace(anchor, tp_sl, 1)

hydrate_anchor = """      qs("#copyBuys").checked=sub.copyBuys!==false;
      qs("#copySells").checked=sub.copySells!==false;"""

hydrate_new = """      qs("#copyBuys").checked=sub.copyBuys!==false;
      qs("#copySells").checked=sub.copySells!==false;

      qs("#takeProfitEnabled").checked=sub.takeProfitEnabled!==false;
      qs("#stopLossEnabled").checked=sub.stopLossEnabled!==false;

      qs("#takeProfitPercent").value=String(
        Math.max(1,Number(sub.takeProfitPercent||100))
      );

      qs("#stopLossPercent").value=String(
        Math.max(1,Math.min(99,Number(sub.stopLossPercent||30)))
      );"""

if 'sub.takeProfitEnabled' not in j:
    if hydrate_anchor not in j:
        raise SystemExit("ERROR: sync.js hydrate point not found")
    j = j.replace(hydrate_anchor, hydrate_new, 1)

payload_anchor = """      copyBuys:qs("#copyBuys").checked,
      copySells:qs("#copySells").checked,
      sellPercent:100"""

payload_new = """      copyBuys:qs("#copyBuys").checked,
      copySells:qs("#copySells").checked,

      takeProfitEnabled:qs("#takeProfitEnabled").checked,
      takeProfitPercent:Math.max(
        1,
        Math.min(10000,Number(qs("#takeProfitPercent").value||100))
      ),

      stopLossEnabled:qs("#stopLossEnabled").checked,
      stopLossPercent:Math.max(
        1,
        Math.min(99,Number(qs("#stopLossPercent").value||30))
      ),

      sellPercent:100"""

if 'takeProfitEnabled:qs("#takeProfitEnabled")' not in j:
    if payload_anchor not in j:
        raise SystemExit("ERROR: sync.js payload point not found")
    j = j.replace(payload_anchor, payload_new, 1)

html.write_text(h)
js.write_text(j)
print("SYNC TP/SL UI + PAYLOAD PATCH INSTALLED")
