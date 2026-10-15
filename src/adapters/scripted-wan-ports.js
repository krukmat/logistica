"use strict";
// Software-only faultable port: no NIC, route, firewall or host mutations.
const IDS=["primary","backup"];
function createScriptedWanPorts(initial={primary:{link:true,upstream:true},backup:{link:true,upstream:true}}){
 if(!initial||IDS.some(id=>typeof initial[id]?.link!=="boolean"||typeof initial[id]?.upstream!=="boolean"))
   throw Error("INVALID_SCRIPTED_WAN");
 const wan={primary:{...initial.primary},backup:{...initial.backup}},faults=new Map(),history=[];
 let route=null,routeFault=null;
 const check=id=>{if(!IDS.includes(id))throw Error("UNKNOWN_WAN_ID");};
 return {
   async probe(id){
     check(id);const fault=faults.get(id);faults.delete(id);
     if(fault==="malformed")return {link:"invalid",upstream:true,reason:"MALFORMED_INJECTED"};
     if(fault==="io-error")throw Error("INJECTED_PROBE_IO_ERROR:"+id);
     return {...wan[id],reason:wan[id].link&&wan[id].upstream?"SYNTHETIC_UP":"SYNTHETIC_DOWN"};
   },
   async applyRoute(selected){
     if(selected!==null&&!IDS.includes(selected))throw Error("INVALID_ROUTE_TARGET");
     const mode=routeFault;routeFault=null;
     if(mode==="before"){history.push({selected,committed:false});throw Error("INJECTED_ROUTE_FAILURE");}
     if(mode==="no-effect"){history.push({selected,committed:false,reportedSuccess:true});return;}
     if(mode==="after"||mode==="after-rollback-fails"){
       route=selected;history.push({selected,committed:true,partial:true});
       if(mode==="after-rollback-fails")routeFault="before";
       throw Error("INJECTED_PARTIAL_ROUTE_APPLY");
     }
     route=selected;history.push({selected,committed:true});
   },
   setWan(id,next){
     check(id);
     if(!next||typeof next!=="object"||
       (next.link!==undefined&&typeof next.link!=="boolean")||
       (next.upstream!==undefined&&typeof next.upstream!=="boolean")||
       (next.link===undefined&&next.upstream===undefined))
       throw Error("INVALID_SCRIPTED_WAN_CHANGE");
     wan[id]={...wan[id],...next};
   },
   failNextProbe(id,mode="malformed"){
     check(id);if(!["malformed","io-error"].includes(mode))throw Error("UNKNOWN_PROBE_FAULT");
     faults.set(id,mode);
   },
   failNextRoute(){routeFault="before";},
   failNextRouteAfterMutation({rollbackFails=false}={}){routeFault=rollbackFails?"after-rollback-fails":"after";},
   failNextRouteNoEffect(){routeFault="no-effect";},
   async readRoute(){return route;},
   simulateOperatorRouteRepair(selected){
     if(selected!==null&&!IDS.includes(selected))throw Error("INVALID_ROUTE_TARGET");
     route=selected;history.push({selected,committed:true,operatorSimulation:true});
   },
   snapshot(){return {route,wan:structuredClone(wan),routeHistory:structuredClone(history),
     physicalValidated:false,hostRoutesChanged:false};}
 };
}
module.exports={createScriptedWanPorts};
