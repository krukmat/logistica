"use strict";
function createVirtualWanPorts(initial){
  const wan={primary:{...initial.primary},backup:{...initial.backup}};
  let route=null;
  return {
    probe:async id=>({link:wan[id].link,upstream:wan[id].upstream,
      reason:wan[id].upstream?"SIMULATED_UP":"SIMULATED_DOWN"}),
    applyRoute:async selected=>{route=selected;},
    set(id,next){
      if(!["primary","backup"].includes(id)||!next||
         typeof next.upstream!=="boolean"||
         (next.link!==undefined&&typeof next.link!=="boolean"))throw Error("INVALID_LAB_WAN");
      wan[id]={link:next.link??wan[id].link,upstream:next.upstream};
      return this.snapshot();
    },
    snapshot:()=>({route,wan:{primary:{...wan.primary},backup:{...wan.backup}},
      kernelRoutingApplied:false,physicalValidated:false})
  };
}
module.exports={createVirtualWanPorts};
