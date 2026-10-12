"use strict";
// W1.9.R: product-domain WAN selection policy. Pure JS, no simulator, OS, clock, IO or dashboard dependencies.
function evaluateWanPolicy({wans,selectedWan=null,clock=0,failbackHoldSeconds=5}={}){
  if(!Array.isArray(wans)||!wans.length||
     !Number.isFinite(clock)||clock<0||
     !Number.isFinite(failbackHoldSeconds)||failbackHoldSeconds<0)
    throw Error("INVALID_WAN_POLICY_INPUT");
  if(new Set(wans.map(w=>w.id)).size!==wans.length||
     wans.some(w=>!w||typeof w.id!=="string"||!w.id||!Number.isFinite(w.priority)||
       typeof w.link!=="boolean"||typeof w.upstream!=="boolean"))
    throw Error("INVALID_WAN_POLICY_INPUT");
  const usable=w=>w.link&&w.upstream;
  const updated=wans.map(w=>({...w,healthySince:usable(w)?
    (w.healthySince===null||w.healthySince===undefined?clock:w.healthySince):null}));
  const available=updated.filter(usable).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const current=updated.find(w=>w.id===selectedWan),best=available[0];
  let next=selectedWan;
  if(!current||!usable(current))next=best?best.id:null;
  else if(best&&best.priority<current.priority&&clock-best.healthySince>=failbackHoldSeconds)next=best.id;
  return {wans:updated,selectedWan:next,
    connectivity:available.length===0?"LOCAL_ONLY":available.length>=2?"MULTI_WAN_HEALTHY":"CONNECTED"};
}
module.exports={evaluateWanPolicy};
