"use strict";
// Pure operational projection of a managed Edge. No IO, credentials or mutable authority.
const STATES=new Set(["NEW","BOOTING","RUNNING","UNHEALTHY","RECOVERING","SAFE_MODE","STOPPING","STOPPED"]);
const REASONS=new Set(["RESTART_BUDGET_EXHAUSTED","BOOT_FAILED","CONFIG_TRANSACTION_UNCERTAIN","LOCAL_RECOVERY_FAILED"]);
function evaluateM3Diagnostics(status,events=[]){
 if(!status||status.kind!=="PEF_M3_MANAGER_STATUS_V1"||!STATES.has(status.phase))
  throw Error("M3_DIAGNOSTICS_STATUS_INVALID");
 if(!Array.isArray(events))throw Error("M3_DIAGNOSTICS_EVENTS_INVALID");
 const phase=status.phase;
 const recentEvents=events.slice(-40).filter(e=>e&&typeof e.type==="string")
  .map(e=>({type:e.type.slice(0,64),
   at:typeof e.at==="string"?e.at.slice(0,32):null,
   phase:STATES.has(e.phase)?e.phase:"UNKNOWN",
   ...(REASONS.has(e.reason)?{reason:e.reason}:{})}));
 return {kind:"PEF_M3_OPERATIONAL_DIAGNOSTICS_V1",schemaVersion:1,
  phase,health:phase==="RUNNING"?"READY":phase==="SAFE_MODE"?"INTERVENTION_REQUIRED":"NOT_READY",
  operatorAction:phase==="SAFE_MODE"?"AUTHENTICATED_LOCAL_RECOVERY":
   phase==="RUNNING"?"NONE":"INSPECT_LOCAL_SERVICE",
  recoveryRequired:phase==="SAFE_MODE",
  policyRevision:status.policyRevision,
  restartCount:status.restartCount,
  restartBudgetRemaining:Math.max(0,status.policy.maxRestarts-status.restartCount),
  missedReadinessChecks:status.missedReadinessChecks,
  safeModeReason:REASONS.has(status.safeModeReason)?status.safeModeReason:null,
  recentEvents,
  scope:"SUPERVISOR_POLICY_ONLY",backend:status.backend,
  physicalValidated:false,powerCutValidated:false,signedConfigValidated:false,
  remoteRecoveryAllowed:false,cloudReal:false,
  kernelLockValidatedHere:false};
}
module.exports={evaluateM3Diagnostics};
