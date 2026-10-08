from pathlib import Path
p=Path('public/sync.js');s=p.read_text()
a='''      engineState!=="execution_wallet_required" &&
      engineState!=="error"'''
b='''      engineState!=="execution_wallet_required" &&
      engineState!=="error" &&
      engineState!=="session_rebind_required" &&
      engineState!=="policy_update_required" &&
      engineState!=="funding_required" &&
      engineState!=="fee_reserve_required" &&
      engineState!=="executor_configuration_required" &&
      engineState!=="delegated_program_required" &&
      engineState!=="session_key_store_required"'''
if s.count(a)!=1:raise SystemExit('UI anchor mismatch; no files modified')
s=s.replace(a,b,1)
a='''    var ready=!!(
      state.wallet &&
      !active &&
      !needsAuthorization &&
      !activating
    );'''
b='''    // Never render a terminal backend failure as an endless spinner.
    var blocked=!!(sub && !active && [
      "session_rebind_required","policy_update_required","funding_required",
      "fee_reserve_required","executor_configuration_required",
      "delegated_program_required","session_key_store_required","error"
    ].includes(engineState));
    var ready=!!(
      state.wallet &&
      !active &&
      !needsAuthorization &&
      !activating && !blocked
    );'''
if s.count(a)!=1:raise SystemExit('UI ready anchor mismatch; no files modified')
s=s.replace(a,b,1)
s=s.replace('badge.classList.toggle("is-pending",needsAuthorization||activating);','badge.classList.toggle("is-pending",needsAuthorization||activating||blocked);',1)
s=s.replace('else if(activating)badge.textContent="PENDING";','else if(blocked)badge.textContent="ACTION NEEDED";\n      else if(activating)badge.textContent="PENDING";',1)
s=s.replace('else if(activating)title.textContent="Activating copy trading";','else if(blocked)title.textContent="Execution needs attention";\n      else if(activating)title.textContent="Activating copy trading";',1)
s=s.replace('startButton.disabled=needsAuthorization||activating||!state.wallet;','startButton.disabled=needsAuthorization||activating||blocked||!state.wallet;',1)
s=s.replace('''          :activating
            ?"ACTIVATING…"''','''          :blocked
            ?"CHECK EXECUTION STATUS"
          :activating
            ?"ACTIVATING…"''',1)
p.write_text(s)
print('SYNC V36 UI terminal-state handling installed')
