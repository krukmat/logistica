"use strict";
// Synthetic timing faults using the actual ConnectivityController; no host routes involved.
const {createScriptedWanPorts}=require("../adapters/scripted-wan-ports.js");
const {createBoundedWanPorts}=require("../adapters/bounded-wan-ports.js");
const {createConnectivityController}=require("../core/connectivity-controller.js");
const gate=()=>{let release;const promise=new Promise(r=>{release=r;});return {promise,release};};
const rejected=async(p,code)=>{try{await p;return false;}catch(e){return e.message===code;}};
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const timings={probeTimeoutMs:15,routeTimeoutMs:15,reconcileTimeoutMs:15};
async function runBoundedPortConformance(){
 const checks=[];
 const put=(id,pass,observed)=>checks.push({id,pass:Boolean(pass),observed});
 try{
   // Boot never assumes old OS routing matches a new in-memory Core.
   {
     const raw=createScriptedWanPorts();
     await raw.applyRoute("primary");
     const ports=createBoundedWanPorts(raw,timings);
     const blocked=await rejected(ports.applyRoute(null),"ROUTE_BOOT_RECONCILIATION_REQUIRED");
     const mismatch=await ports.reconcile(null);
     const matched=await ports.reconcile("primary");
     put("PORT_BOOT_ROUTE_RECONCILIATION",blocked&&!mismatch&&matched&&
       ports.status().bootReconciled,
       {blocked,mismatch,matched});
   }
   // Uncooperative slow read-only probe: no clock or route commit; signal is advisory.
   {
     const raw=createScriptedWanPorts(),orig=raw.probe.bind(raw),h=gate();
     let aborted=false;
     raw.probe=(id,{signal}={})=>{
       if(id!=="primary")return orig(id);
       signal?.addEventListener("abort",()=>{aborted=true;},{once:true});
       return h.promise;
     };
     const ports=createBoundedWanPorts(raw,timings);
     await ports.reconcile(null);
     const core=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
     const timed=await rejected(core.sample(1),"PORT_PROBE_DEADLINE_EXCEEDED");
     h.release({link:true,upstream:true});await drain();
     put("PORT_PROBE_DEADLINE_NO_COMMIT",timed&&aborted&&
       core.status().clock===0&&raw.snapshot().route===null,
       {timed,aborted,clock:core.status().clock,route:raw.snapshot().route});
   }
   // Mutation may finish after timeout, so quarantine remains even if the task resolves.
   {
     const raw=createScriptedWanPorts(),orig=raw.applyRoute.bind(raw),h=gate();
     let once=true,abortObserved=false;
     raw.applyRoute=async(target,{signal}={})=>{
       if(once){once=false;signal?.addEventListener("abort",()=>{abortObserved=true;},{once:true});await h.promise;}
       return orig(target);
     };
     const ports=createBoundedWanPorts(raw,timings);
     await ports.reconcile(null);
     const core=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
     const timed=await rejected(core.sample(1),"PORT_ROUTE_DEADLINE_EXCEEDED");
     const stillPending=ports.status().pendingRoute;
     const blocked=await rejected(core.sample(1),"ROUTE_RECONCILIATION_REQUIRED");
     const premature=await ports.reconcile(null);
     put("PORT_LATE_ROUTE_QUARANTINE",timed&&stillPending&&blocked&&!premature&&
       abortObserved&&core.status().clock===0&&ports.status().quarantined,
       {timed,stillPending,blocked,premature,abortObserved});
     h.release();await drain();
     const lateMutated=raw.snapshot().route==="primary";
     const wrong=await ports.reconcile(null);
     raw.simulateOperatorRouteRepair(null);
     const repaired=await ports.reconcile(null);
     const completed=await core.sample(1);
     put("PORT_LATE_COMMIT_REQUIRES_REPAIR",lateMutated&&!wrong&&repaired&&
       completed.selectedWan==="primary"&&raw.snapshot().route==="primary"&&
       !ports.status().quarantined,
       {lateMutated,wrong,repaired,wan:completed.selectedWan});
   }
   // Cooperative driver can reject upon AbortSignal but operator still verifies route.
   {
     const raw=createScriptedWanPorts(),orig=raw.applyRoute.bind(raw);
     let once=true,signalSeen=false;
     raw.applyRoute=async(target,{signal}={})=>{
       if(once){
         once=false;
         return new Promise((_,reject)=>{
           signal?.addEventListener("abort",()=>{signalSeen=true;reject(Error("ABORTED_IN_DRIVER"));},{once:true});
         });
       }
       return orig(target);
     };
     const ports=createBoundedWanPorts(raw,timings);
     await ports.reconcile(null);
     const core=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
     const timed=await rejected(core.sample(1),"PORT_ROUTE_DEADLINE_EXCEEDED");
     await drain();
     const safe=raw.snapshot().route===null;
     const verified=await ports.reconcile(null);
     put("PORT_COOPERATIVE_ABORT_RECHECK",timed&&signalSeen&&safe&&verified&&
       core.status().clock===0,{timed,signalSeen,safe,verified});
   }
   // Driver ignoring cancellation is never automatically unblocked.
   {
     const raw=createScriptedWanPorts(),h=gate();
     raw.applyRoute=async()=>h.promise;
     const ports=createBoundedWanPorts(raw,timings);
     await ports.reconcile(null);
     const core=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
     const timed=await rejected(core.sample(1),"PORT_ROUTE_DEADLINE_EXCEEDED");
     const cannotReconcile=await ports.reconcile(null);
     const blocked=await rejected(core.sample(1),"ROUTE_RECONCILIATION_REQUIRED");
     put("PORT_HUNG_ROUTE_REMAINS_BLOCKED",timed&&!cannotReconcile&&blocked&&
       ports.status().pendingRoute&&core.status().clock===0,
       {timed,cannotReconcile,blocked,pending:ports.status().pendingRoute});
     h.release();await drain();
   }
 }catch(e){
   put("PORT_BOUNDED_CONFORMANCE_UNHANDLED",false,String(e.message||e));
 }
 return checks;
}
module.exports={runBoundedPortConformance};
