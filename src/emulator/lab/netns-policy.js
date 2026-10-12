"use strict";
// Pure policy bridge: inject a real probe and a sandbox-only route writer.
// This module does not execute OS commands or claim physical WAN certification.
const {createSimulator}=require("../core.js");
const WAN_IDS=["primary","backup"];
function createConnectivityController({probe,applyRoute,simulatorOptions={}}){
  if(typeof probe!=="function"||typeof applyRoute!=="function")throw Error("INVALID_CONTROLLER_PORT");
  const simulator=createSimulator(simulatorOptions);
  const observations=[];
  async function sample(seconds=1){
    if(!Number.isFinite(seconds)||seconds<=0)throw Error("INVALID_SAMPLE_CLOCK");
    // Collect probes before changing policy; no route mutation if a probe is invalid.
    const measured=await Promise.all(WAN_IDS.map(async id=>{
      const p=await probe(id);
      if(!p||typeof p.link!=="boolean"||typeof p.upstream!=="boolean")throw Error("INVALID_WAN_PROBE:"+id);
      return {wan:id,link:p.link,upstream:p.upstream,reason:String(p.reason||"")};
    }));
    for(const p of measured)simulator.act("set_wan",{id:p.wan,link:p.link,upstream:p.upstream});
    simulator.act("tick",{seconds});
    const observed=simulator.status();
    // Only applyRoute knows the device/kernel backend. Null means LOCAL_ONLY.
    await applyRoute(observed.selectedWan);
    const record={logicalTime:observed.clock,selectedWan:observed.selectedWan,connectivity:observed.connectivity,health:observed.health,probes:measured,routeApplied:true};
    observations.push(record);
    return JSON.parse(JSON.stringify(record));
  }
  return {sample,status:()=>simulator.status(),observations:()=>JSON.parse(JSON.stringify(observations)),trace:()=>simulator.trace()};
}
module.exports={createConnectivityController};
