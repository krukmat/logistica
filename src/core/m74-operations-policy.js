"use strict";
// Portable allowlisted operational record. Never persist secrets or arbitrary log content.
const {validateIdentity}=require("./event-envelope.js");
const TYPES=new Set(["READY","CONFIG_COMMITTED","CONFIG_ROLLED_BACK",
 "RESTART_BUDGET_EXHAUSTED","SAFE_MODE_ENTERED","LOCAL_RECOVERY_REQUESTED",
 "RECOVERED","STOPPED","CLOUD_OUTAGE","CLOUD_RECONCILED",
 "SIGNED_RELEASE_REJECTED","SIGNED_RELEASE_ROLLBACK"]);
function validateM74Event(event){
 if(!event||!TYPES.has(event.type)||typeof event.correlationId!=="string"||
   !/^[a-f0-9-]{36}$/.test(event.correlationId)||
   !Number.isSafeInteger(event.atMillis)||event.atMillis<=0||
   !["INFO","WARNING","CRITICAL"].includes(event.severity)||
   !["SYSTEM","OPERATOR"].includes(event.actor))
   throw Error("M74_EVENT_POLICY_DENIED");
 return {type:event.type,correlationId:event.correlationId,
  atMillis:event.atMillis,severity:event.severity,actor:event.actor};
}
function scopedIdentity(scope){
 const id=validateIdentity(scope);
 return {siteId:id.siteId,deviceId:id.deviceId,configRevision:id.configRevision};
}
module.exports={validateM74Event,scopedIdentity};
