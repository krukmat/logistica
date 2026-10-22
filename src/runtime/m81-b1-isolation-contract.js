"use strict";
// M8.1.B1 — static driver integration contract. Does not activate Linux privileges.
const {makeLinuxIsolationPlan}=require("../adapters/linux-workload-isolation.js");
const {propertyManifest,hostManifest}=require("./demo-workload.js");
const {assessM81LimaScope,VM_NAME}=require("../adapters/m81-lima-isolation-scope.js");
function runM81B1IsolationContract(){
 const property=makeLinuxIsolationPlan(propertyManifest());
 const host=makeLinuxIsolationPlan(hostManifest());
 const checks={
  LIMA_DRIVER_SCOPE_SEPARATE_FROM_GITHUB_CI:true,
  EXPLICIT_GUEST_ROOT_VM_KERNEL_GATES:true,
  DISTINCT_PEFS3_VS_M81_NAMESPACE_PREFIX:true,
  REQUIRED_ROOT_OWNED_PRIVATE_SANDBOX:true,
  PROPERTY_QUOTAS_PINNED:property.workloadId==="pef-property"&&
   property.cpuMax==="15000 100000"&&property.memoryMax==="67108864"&&
   property.memorySwapMax==="0"&&property.pidsMax==="16",
  HOST_QUOTAS_PINNED:host.workloadId==="pef-host"&&
   host.cpuMax==="18000 100000"&&host.memoryMax==="83886080"&&
   host.memorySwapMax==="0"&&host.pidsMax==="16",
  UNSANDBOXED_FALLBACK_ALLOWED:false,
  GUEST_HARNESS_PREPARED:false,
  GUEST_KERNEL_ENFORCEMENT_OBSERVED:false
 };
 const policyProbe=assessM81LimaScope({
  platform:"darwin",arch:"arm64",uid:501,
  env:{PEF_M81_VM_ID:VM_NAME,PEF_M81_ISOLATION_SCOPE:"M81_LIMA_VM"},
  hostname:"MacBook",pid1:"launchd",memoryMiB:32768,
  cpuCount:18,cgroupV2:false,controllers:[],vmDetected:false,nodeMajor:22});
 return {kind:"PEF_M81_B1_ISOLATION_CONTRACT_V1",
  task:"M8.1.B1",status:"CODE_READY_GUEST_NOT_RUN",ok:false,
  readyForM81B2:false,actualGuestIsolationValidated:false,
  staticContractOk:checks.PROPERTY_QUOTAS_PINNED&&checks.HOST_QUOTAS_PINNED&&
   !checks.UNSANDBOXED_FALLBACK_ALLOWED&&!policyProbe.ok,
  checks,policyProbe:{status:policyProbe.status,
   rootDenied:policyProbe.failed.includes("ROOT_IN_GUEST"),
   hostDenied:policyProbe.failed.includes("GUEST_LINUX_ARM64")},
  profile:"pef-r28s-1g",
  isolatedWorkerEntrypoint:"createLinuxIsolatedProcessDriver(runtimeScope=M81_LIMA_VM)",
  oldCiScopePreserved:true,
  operatorProvidedGuestAttestation:false,
  guestServiceStarted:false,vmStarted:false,hostModified:false,
  physicalValidated:false,productionAuthorized:false,
  nextDependency:"M8.1.B2: privileged guest disposable sandbox staging and combined Edge+Cloud demonstration"};
}
module.exports={runM81B1IsolationContract};
