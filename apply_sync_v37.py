from pathlib import Path
p=Path('public/sync.js')
s=p.read_text()
old='''      startButton.disabled=needsAuthorization||activating||blocked||!state.wallet;'''
new='''      // V37: blocked means status inspection, never a new trade activation.
      startButton.disabled=state.busy||needsAuthorization||activating||!state.wallet;'''
assert s.count(old)==1, 'Unexpected start button source; no changes made'
s=s.replace(old,new,1)
old2='''    qs("#copyForm").onsubmit=function(event){event.preventDefault();saveCopy(true)};'''
new2='''    qs("#copyForm").onsubmit=function(event){
      event.preventDefault();
      var sub=state.copy||{};
      var code=String(sub.engineState||'').toLowerCase();
      if(["session_rebind_required","policy_update_required","funding_required",
          "fee_reserve_required","executor_configuration_required",
          "delegated_program_required","session_key_store_required","error"].includes(code)){
        inspectExecutionStatus();
        return;
      }
      saveCopy(true);
    };'''
assert s.count(old2)==1, 'Unexpected form handler source; no changes made'
s=s.replace(old2,new2,1)
anchor='''  async function saveCopy(enabled){'''
insert='''  // V37: status-only refresh. Never creates a new subscription or signs a policy.
  async function inspectExecutionStatus(){
    if(state.busy||!roomReady()||!state.wallet)return;
    state.busy=true;
    renderCopyState();
    try{
      var id=encodeURIComponent(state.room.leader.id);
      var data=await api("/api/entities/"+id+"/copy/execution/refresh",{method:"POST"});
      state.copy=data.subscription||state.copy;
      state.execution=data;
      state.authorizationUrl=authorizationFromExecution(data);
      var engine=data.engine||{};
      var code=String(engine.authorizationState||state.copy&&state.copy.engineState||"unknown");
      var message=String(engine.message||engine.executionReadyReason||"Execution state: "+code);
      toast(message);
      if(code==="session_rebind_required"){
        toast("Existing vault requires verified session recovery. Do not sign again.");
      }
      await loadCopyState();
    }catch(error){
      toast("Execution status check failed: "+String(error.message||error));
    }finally{
      state.busy=false;
      renderCopyState();
    }
  }

'''+anchor
assert s.count(anchor)==1, 'Missing insertion point'
s=s.replace(anchor,insert,1)
p.write_text(s)
print('SYNC V37 safe status check installed')
