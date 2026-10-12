"use strict";
// Parallel state projection over the existing PEF simulator. This module NEVER
// decides WAN routing, commits, workload admission, or actual durability.
function statechart(status){
  const workloads=Object.values(status.workloads||{});
  const running=workloads.filter(w=>w.status==="RUNNING").length;
  const isolated=workloads.filter(w=>w.status==="ISOLATED").length;
  const free=Math.max(0,status.p1CapacityBytes-status.p1Used);
  return {
    type:"parallel",version:1,
    regions:{
      core:{state:status.health},
      connectivity:{state:status.connectivity,activeWan:status.selectedWan},
      cloud:{state:status.cloud},
      journal:{state:free===0?"FULL":status.p1Used/status.p1CapacityBytes>=0.85?"PRESSURE":"READY",
        usedBytes:status.p1Used,capacityBytes:status.p1CapacityBytes,pending:status.pendingEvents},
      runtime:{state:isolated>0?"ISOLATED":running>0?"RUNNING":"IDLE",running,isolated},
      security:{state:status.security}
    }
  };
}
function changes(before,after){
  const b=statechart(before).regions,a=statechart(after).regions;
  return Object.keys(a).flatMap(region=>{
    const stateChanged=b[region].state!==a[region].state;
    const selectedChanged=region==="connectivity"&&b[region].activeWan!==a[region].activeWan;
    return stateChanged||selectedChanged?
      [{region,from:b[region].state,to:a[region].state,...(selectedChanged?{wanBefore:b[region].activeWan,wanAfter:a[region].activeWan}:{})}]:[];
  });
}
module.exports={statechart,changes};
