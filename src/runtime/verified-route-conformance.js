"use strict";
// W1.10.B1: controlled partial-commit routing failures on the real Connectivity Core.
const {createScriptedWanPorts}=require("../adapters/scripted-wan-ports.js");
const {createVerifiedRoutePorts}=require("../adapters/verified-route-ports.js");
const {createConnectivityController}=require("../core/connectivity-controller.js");
async function runVerifiedRouteConformance(){
 const checks=[];
 const add=(id,pass,observed)=>checks.push({id,pass:Boolean(pass),observed});
 const raw=createScriptedWanPorts(),ports=createVerifiedRoutePorts(raw);
 const core=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
 try{
   await core.sample(1);
   raw.setWan("primary",{upstream:false});
   const baseline=core.status();
   raw.failNextRouteAfterMutation();
   let rollbackRejected=false;
   try{await core.sample(1);}catch(e){rollbackRejected=e.message==="ROUTE_APPLY_ROLLED_BACK";}
   add("PORT_PARTIAL_ROUTE_ROLLBACK",rollbackRejected&&raw.snapshot().route==="primary"&&
     core.status().clock===baseline.clock&&core.status().selectedWan==="primary"&&
     ports.status().quarantined===false,
     {rejected:rollbackRejected,route:raw.snapshot().route,quarantined:ports.status().quarantined});
   raw.failNextRouteNoEffect();
   let readbackRejected=false;
   try{await core.sample(1);}catch(e){readbackRejected=e.message==="ROUTE_APPLY_ROLLED_BACK";}
   add("PORT_ROUTE_POSTCHECK_REJECTS_FALSE_SUCCESS",readbackRejected&&
     raw.snapshot().route==="primary"&&core.status().clock===baseline.clock,
     {rejected:readbackRejected,route:raw.snapshot().route});
   raw.failNextRouteAfterMutation({rollbackFails:true});
   let uncertain=false;
   try{await core.sample(1);}catch(e){uncertain=e.message==="ROUTE_UNCERTAIN_RECONCILIATION_REQUIRED";}
   let blocked=false;
   try{await core.sample(1);}catch(e){blocked=e.message==="ROUTE_RECONCILIATION_REQUIRED";}
   add("PORT_UNCERTAIN_ROUTE_QUARANTINE",uncertain&&blocked&&
     ports.status().quarantined===true&&raw.snapshot().route==="backup"&&
     core.status().clock===baseline.clock,
     {uncertain,blocked,externalRoute:raw.snapshot().route,coreRoute:core.status().selectedWan});
   raw.simulateOperatorRouteRepair("primary");
   const reconciled=await ports.reconcile("primary");
   const completed=await core.sample(1);
   add("PORT_EXPLICIT_ROUTE_RECONCILIATION",reconciled&&
     completed.selectedWan==="backup"&&raw.snapshot().route==="backup"&&
     ports.status().quarantined===false,
     {reconciled,route:raw.snapshot().route,quarantined:ports.status().quarantined});
 }catch(e){
   add("PORT_ROUTE_CONFORMANCE_UNHANDLED",false,String(e.message||e));
 }
 return checks;
}
module.exports={runVerifiedRouteConformance};
