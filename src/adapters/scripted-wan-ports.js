"use strict";
// Software-only faultable port: no NIC, route, firewall or host mutations.
const IDS=["primary","backup"];
function createScriptedWanPorts(initial={primary:{link:true,upstream:true},backup:{link:true,upstream:true}}){
 if(!initial||IDS.some(id=>typeof initial[id]?.link!=="boolean"||typeof initial[id]?.upstream!=="boolean"))
   throw Error("INVALID_SCRIPTED_WAN");
 const wan={primary:{...initial.primary},backup:{...initial.backup}},faults=new Map(),history=[];
 let route=null,failRoute=false;
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
     if(failRoute){failRoute=false;history.push({selected,committed:false});throw Error("INJECTED_ROUTE_FAILURE");}
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
   failNextRoute(){failRoute=true;},
   snapshot(){return {route,wan:structuredClone(wan),routeHistory:structuredClone(history),
     physicalValidated:false,hostRoutesChanged:false};}
 };
}
module.exports={createScriptedWanPorts};
