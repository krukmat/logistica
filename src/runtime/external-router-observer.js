"use strict";
// W1.10.F3.2: read-only contract for existing external-router observer.
// NO router brand driver, credentials, commands, physical WAN control, or route writes.
const NAME=/^[a-zA-Z0-9._-]{3,80}$/;
function validate(status,{nowMs=Date.now(),maxAgeMs=30000}={}){
 if(!status||status.kind!=="PEF_EXTERNAL_ROUTER_STATUS_V1"||
    status.wanOwner!=="EXTERNAL_ROUTER"||!NAME.test(status.routerId||"")||
    !Number.isSafeInteger(status.observedAtMs)||!Number.isSafeInteger(nowMs)||
    !Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>60000||
    status.observedAtMs>nowMs+5000||nowMs-status.observedAtMs>maxAgeMs)
   return {ok:false,error:"ROUTER_STATUS_INVALID_OR_STALE"};
 const uplinks=status.uplinks;
 if(!uplinks||!["primary","backup"].every(id=>{
  const p=uplinks[id];return p&&typeof p.link==="boolean"&&typeof p.upstream==="boolean"&&! (p.upstream&&!p.link);
 })||!["primary","backup",null].includes(status.selectedWan))
  return {ok:false,error:"ROUTER_WAN_STATE_INVALID"};
 if(status.selectedWan!==null&&
    (!uplinks[status.selectedWan].link||!uplinks[status.selectedWan].upstream))
   return {ok:false,error:"ROUTER_SELECTED_ROUTE_NOT_REACHABLE"};
 return {ok:true,kind:"PEF_ROUTER_READ_ONLY_OBSERVATION_V1",
   routerId:status.routerId,wanOwner:"EXTERNAL_ROUTER",selectedWan:status.selectedWan,
   uplinks:{primary:{link:uplinks.primary.link,upstream:uplinks.primary.upstream},
            backup:{link:uplinks.backup.link,upstream:uplinks.backup.upstream}},
   telemetryAgeMs:nowMs-status.observedAtMs,latencyNotMeasured:true,
   hostRoutesChanged:false,wanControlledByPEF:false,physicalValidated:false};
}
async function observeRouter(connector,opts={}){
 if(!connector||typeof connector.getStatus!=="function"||
    Object.keys(connector).some(k=>k!=="getStatus"))
   throw Error("ROUTER_ONLY_READONLY_GETSTATUS_ALLOWED");
 const result=await connector.getStatus();
 return validate(result,opts);
}
module.exports={validate,observeRouter};
