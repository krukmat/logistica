"use strict";
// Adapter-only transactional boundary for future Linux routing drivers.
// Fail closed if verification/compensation cannot prove a consistent route.
const valid=route=>route===null||route==="primary"||route==="backup";
function createVerifiedRoutePorts(raw){
 if(!raw||["probe","applyRoute","readRoute"].some(k=>typeof raw[k]!=="function"))
   throw Error("VERIFIED_ROUTE_PORTS_REQUIRED");
 let quarantined=false,inFlight=false,reason=null;
 const route=async(signal)=>{const observed=await raw.readRoute({signal});if(!valid(observed))throw Error("INVALID_ROUTE_READBACK");return observed;};
 const applyRoute=async (target,{signal}={})=>{
   if(!valid(target))throw Error("INVALID_ROUTE_TARGET");
   if(quarantined)throw Error("ROUTE_RECONCILIATION_REQUIRED");
   if(inFlight)throw Error("ROUTE_TRANSACTION_BUSY");
   inFlight=true;
   try{
     let before;
     try{before=await route(signal);}
     catch(e){quarantined=true;reason="ROUTE_PRECHECK_FAILED";throw Error(reason);}
     try{
       await raw.applyRoute(target,{signal});
       if((await route(signal))!==target)throw Error("ROUTE_POSTCHECK_MISMATCH");
       return;
     }catch(e){
       try{
         await raw.applyRoute(before);
         if((await route())!==before)throw Error("ROUTE_ROLLBACK_POSTCHECK_MISMATCH");
       }catch(rollbackError){
         quarantined=true;reason="ROUTE_UNCERTAIN_RECONCILIATION_REQUIRED";
         throw Error(reason);
       }
       reason=null;
       throw Error("ROUTE_APPLY_ROLLED_BACK");
     }
   }finally{inFlight=false;}
 };
 async function reconcile(expected,{signal}={}){
   if(!valid(expected))throw Error("INVALID_ROUTE_TARGET");
   if(inFlight)throw Error("ROUTE_TRANSACTION_BUSY");
   let current;
   try{current=await route(signal);}catch(e){quarantined=true;reason="ROUTE_RECONCILIATION_READ_FAILED";return false;}
   if(current!==expected)return false;
   quarantined=false;reason=null;return true;
 }
 return {probe:(id,...args)=>raw.probe(id,...args),applyRoute,reconcile,
   status:()=>({quarantined,inFlight,reason,physicalValidated:false,routeReadbackVerified:!quarantined})};
}
module.exports={createVerifiedRoutePorts};
