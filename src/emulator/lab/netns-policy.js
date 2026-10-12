"use strict";
// Shared product-domain policy + injected observation and route-writing ports.
// This controller uses NO simulator: virtual panel and Linux isolated routes share this implementation.
const {evaluateWanPolicy}=require("../../core/wan-policy.js");
const WAN_IDS=["primary","backup"];
function createConnectivityController({probe,applyRoute,simulatorOptions={}}={}){
  if(typeof probe!=="function"||typeof applyRoute!=="function")throw Error("INVALID_CONTROLLER_PORT");
  const hold=simulatorOptions.failbackHoldSeconds??5;
  let clock=0,committed=evaluateWanPolicy({
    wans:WAN_IDS.map((id,i)=>({id,priority:i+1,link:true,upstream:true,healthySince:null})),
    selectedWan:null,clock,failbackHoldSeconds:hold});
  const observations=[],events=[];
  function status(){
    return {clock,profile:simulatorOptions.profile||"BASE",
      wans:committed.wans.map(w=>({id:w.id,priority:w.priority,link:w.link,upstream:w.upstream})),
      selectedWan:committed.selectedWan,connectivity:committed.connectivity,health:"HEALTHY",
      physicalWanValidated:false};
  }
  async function sample(seconds=1){
    if(!Number.isFinite(seconds)||seconds<=0)throw Error("INVALID_SAMPLE_CLOCK");
    // No state commit or route action on malformed probes; no state commit on route error.
    const measured=await Promise.all(WAN_IDS.map(async id=>{
      const p=await probe(id);
      if(!p||typeof p.link!=="boolean"||typeof p.upstream!=="boolean")
        throw Error("INVALID_WAN_PROBE:"+id);
      return {wan:id,link:p.link,upstream:p.upstream,reason:String(p.reason||"")};
    }));
    const nextClock=clock+seconds;
    const wans=committed.wans.map(w=>{
      const input=measured.find(p=>p.wan===w.id);
      return {...w,link:input.link,upstream:input.upstream};
    });
    const candidate=evaluateWanPolicy({wans,selectedWan:committed.selectedWan,
      clock:nextClock,failbackHoldSeconds:hold});
    await applyRoute(candidate.selectedWan);
    const previous=committed.selectedWan;
    clock=nextClock;
    committed=candidate;
    for(const p of measured)events.push({t:clock,kind:"WAN_FAULT",id:p.wan,link:p.link,upstream:p.upstream});
    if(previous!==candidate.selectedWan)
      events.push({t:clock,kind:"WAN_SELECTED",from:previous,to:candidate.selectedWan});
    const record={logicalTime:clock,selectedWan:candidate.selectedWan,connectivity:candidate.connectivity,
      health:"HEALTHY",probes:measured,routeApplied:true};
    observations.push(record);
    return JSON.parse(JSON.stringify(record));
  }
  const copy=x=>JSON.parse(JSON.stringify(x));
  return {sample,status,observations:()=>copy(observations),trace:()=>copy(events)};
}
module.exports={createConnectivityController};
