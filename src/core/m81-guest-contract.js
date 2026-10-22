"use strict";
// M8.1.A: portable, pure guest-contract assessment. Never provisions a VM or a service.
const VALID_PROFILE="r28s-1g",KIND="PEF_M81_GUEST_OBSERVATION_V1";
const CONTROLLERS=["cpu","memory","pids"];
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function checkGuestReport(report){
 if(!isObject(report)||report.kind!==KIND||report.profile!==VALID_PROFILE||
    report.readOnly!==true||report.guestServicesModified!==false||
    report.hostRoutesModified!==false||!isObject(report.observed))
  return {accepted:false,reason:"INVALID_GUEST_REPORT_CONTRACT"};
 const o=report.observed;
 if(o.platform!=="linux"||o.arch!=="arm64"||!Number.isSafeInteger(o.memoryMiB)||
    o.memoryMiB<1||o.memoryMiB>65536||!Number.isSafeInteger(o.cpuCount)||
    o.cpuCount<1||o.cpuCount>256||!Number.isSafeInteger(o.nodeMajor)||
    o.nodeMajor<1||o.nodeMajor>100||typeof o.pid1!=="string"||
    !/^[a-zA-Z0-9_-]{1,40}$/.test(o.pid1)||typeof o.cgroupV2!=="boolean"||
    !Array.isArray(o.controllers)||o.controllers.length>20||
    o.controllers.some(x=>typeof x!=="string"||!/^[a-z_]{1,24}$/.test(x))||
    typeof o.vmDetected!=="boolean")
  return {accepted:false,reason:"INVALID_GUEST_OBSERVATION_VALUES"};
 return {accepted:true,observed:{
  platform:o.platform,arch:o.arch,memoryMiB:o.memoryMiB,cpuCount:o.cpuCount,
  nodeMajor:o.nodeMajor,pid1:o.pid1,cgroupV2:o.cgroupV2,
  controllers:[...new Set(o.controllers)],vmDetected:o.vmDetected}};
}
function assessM81GuestContract({guestReport=null,releaseContractOk=true,
 propertyPlan=null,hostPlan=null,isolatedDriverGuestSupported=false}={}){
 const imported=guestReport===null?null:checkGuestReport(guestReport);
 const o=imported?.accepted?imported.observed:null;
 const guestChecks={
  LINUX_ARM64:o?o.platform==="linux"&&o.arch==="arm64":null,
  GUEST_MEMORY_1G:o?o.memoryMiB>=901&&o.memoryMiB<=1086:null,
  GUEST_CPU_MAX4:o?o.cpuCount<=4:null,
  NODE20_PLUS:o?o.nodeMajor>=20:null,
  SYSTEMD_PID1:o?o.pid1==="systemd":null,
  CGROUP_V2_CONTROLLERS:o?o.cgroupV2&&CONTROLLERS.every(x=>o.controllers.includes(x)):null,
  VM_GUEST_INDICATOR:o?o.vmDetected:true};
 if(!o)guestChecks.VM_GUEST_INDICATOR=null;
 const staticChecks={
  SYSTEMD_UNIT_RENDERABLE:releaseContractOk===true,
  PROPERTY_QUOTA_PLAN:propertyPlan?.workloadId==="pef-property"&&
   propertyPlan?.memoryMax==="67108864"&&propertyPlan?.cpuMax==="15000 100000"&&
   propertyPlan?.memorySwapMax==="0"&&propertyPlan?.pidsMax==="16",
  HOST_QUOTA_PLAN:hostPlan?.workloadId==="pef-host"&&
   hostPlan?.memoryMax==="83886080"&&hostPlan?.cpuMax==="18000 100000"&&
   hostPlan?.memorySwapMax==="0"&&hostPlan?.pidsMax==="16",
  GUARDED_GUEST_ISOLATION_DRIVER_AVAILABLE:isolatedDriverGuestSupported===true
 };
 const guestObservationComplete=Object.values(guestChecks).every(x=>x===true);
 const blockers=[];
 if(!Object.values(staticChecks).slice(0,3).every(Boolean))
  blockers.push("STATIC_CONTRACT_FAILED");
 if(imported&&!imported.accepted)blockers.push("INVALID_OPERATOR_GUEST_REPORT");
 if(!guestObservationComplete)blockers.push("GUEST_PREFLIGHT_NOT_VERIFIED");
 // The existing Linux-isolated driver is GitHub-hosted CI root-only. Never
 // claim 1GiB VM execution or bypass its guard to make a green status.
 if(!staticChecks.GUARDED_GUEST_ISOLATION_DRIVER_AVAILABLE)
  blockers.push("LINUX_DRIVER_HOSTED_CI_ONLY_VM_PORT_NOT_IMPLEMENTED");
 blockers.push("SINGLE_GUEST_SYSTEMD_CGROUP_CLOUD_MTLS_E2E_NOT_RUN");
 return {kind:"PEF_M81_GUEST_PREFLIGHT_V1",task:"M8.1.A",profile:VALID_PROFILE,
  status:"BLOCKED",ok:false,contractStatus:Object.values(staticChecks).slice(0,3).every(Boolean)?
   "STATIC_CONTRACT_PASS":"STATIC_CONTRACT_FAIL",
  guestObservationStatus:guestReport===null?"NOT_RUN":imported.accepted?
   "OPERATOR_REPORTED_UNATTESTED":"REJECTED",
  importedReason:imported&&!imported.accepted?imported.reason:null,
  evidenceOrigin:guestReport===null?"NO_VM_EVIDENCE":"UNATTESTED_OPERATOR_REPORT",
  staticChecks,guestChecks,observed:o,
  blockers,readyForM81B:false,
  guestObservedByThisDashboard:false,
  guestRuntimeValidated:false,kernelLimitsEnforcedValidated:false,
  systemdGuestActivated:false,cloudLiteGuestValidated:false,
  vmBootOrRebootPerformed:false,guestModified:false,hostModified:false,
  physicalValidated:false,physicalPowerCutValidated:false,
  testsRequireOperatorOptIn:true};
}
module.exports={assessM81GuestContract,checkGuestReport};
