"use strict";
// W1.10.B2: deadline at host adapter boundary, not inside Product Core.
// A JS AbortSignal is advisory: an external OS command can still mutate routes later.
const {createVerifiedRoutePorts}=require("./verified-route-ports.js");
const valid=route=>route===null||route==="primary"||route==="backup";
const limit=ms=>Number.isSafeInteger(ms)&&ms>=5&&ms<=30000;
function createBoundedWanPorts(raw,{probeTimeoutMs=40,routeTimeoutMs=40,reconcileTimeoutMs=40}={}){
 if(!limit(probeTimeoutMs)||!limit(routeTimeoutMs)||!limit(reconcileTimeoutMs))
   throw Error("INVALID_PORT_DEADLINE");
 const verified=createVerifiedRoutePorts(raw);
 let quarantine="ROUTE_BOOT_RECONCILIATION_REQUIRED",pending=null,reconciling=false;
 function deadline(promise,ms,controller,error){
   let timeout=null;
   const expiry=new Promise((_,reject)=>{
     timeout=setTimeout(()=>{controller.abort();reject(Error(error));},ms);
   });
   return Promise.race([promise,expiry]).finally(()=>clearTimeout(timeout));
 }
 async function probe(id){
   const controller=new AbortController();
   const task=Promise.resolve().then(()=>verified.probe(id,{signal:controller.signal}));
   return deadline(task,probeTimeoutMs,controller,"PORT_PROBE_DEADLINE_EXCEEDED");
 }
 async function applyRoute(target){
   if(!valid(target))throw Error("INVALID_ROUTE_TARGET");
   if(quarantine)throw Error(quarantine==="ROUTE_BOOT_RECONCILIATION_REQUIRED"?
     quarantine:"ROUTE_RECONCILIATION_REQUIRED");
   if(pending||reconciling)throw Error("ROUTE_TRANSACTION_BUSY");
   const controller=new AbortController();
   const task=Promise.resolve().then(()=>verified.applyRoute(target,{signal:controller.signal}));
   pending=task;
   // Observe eventual completion; do NOT let a late completion clear quarantine.
   const clear=()=>{if(pending===task)pending=null;};
   task.then(clear,clear);
   try{
     return await deadline(task,routeTimeoutMs,controller,"PORT_ROUTE_DEADLINE_EXCEEDED");
   }catch(e){
     if(e.message==="PORT_ROUTE_DEADLINE_EXCEEDED")
       quarantine="ROUTE_TIMEOUT_RECONCILIATION_REQUIRED";
     else if(verified.status().quarantined)
       quarantine="ROUTE_UNCERTAIN_RECONCILIATION_REQUIRED";
     throw e;
   }
 }
 async function reconcile(expected){
   if(!valid(expected))throw Error("INVALID_ROUTE_TARGET");
   if(pending||reconciling)return false;
   reconciling=true;
   const controller=new AbortController();
   const task=Promise.resolve().then(()=>verified.reconcile(expected,{signal:controller.signal}));
   try{
     const ok=await deadline(task,reconcileTimeoutMs,controller,"PORT_RECONCILE_DEADLINE_EXCEEDED");
     if(ok)quarantine=null;
     return Boolean(ok);
   }catch(e){quarantine="ROUTE_RECONCILIATION_UNVERIFIED";return false;}
   finally{reconciling=false;}
 }
 function status(){
   const underlying=verified.status();
   return {quarantined:Boolean(quarantine||underlying.quarantined),reason:quarantine||underlying.reason,
     pendingRoute:Boolean(pending),reconciling,
     bootReconciled:quarantine===null&&!underlying.quarantined,
     probeTimeoutMs,routeTimeoutMs,reconcileTimeoutMs,
     physicalValidated:false,hostRoutesChanged:false};
 }
 return {probe,applyRoute,reconcile,status};
}
module.exports={createBoundedWanPorts};
