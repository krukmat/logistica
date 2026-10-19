"use strict";
// Dashboard-safe read-only policy report: kernel evidence is produced ONLY on CI Linux.
const {propertyManifest,hostManifest}=require("./demo-workload.js");
const {makeLinuxIsolationPlan}=require("../adapters/linux-workload-isolation.js");
function runM55IsolationContract(){
 const profiles={};
 for(const [name,manifest] of [["property",propertyManifest()],["host",hostManifest()]]){
  const plan=makeLinuxIsolationPlan(manifest);
  profiles[name]={manifestId:manifest.workload_id,cpuMax:plan.cpuMax,
    memoryMax:plan.memoryMax,pidsMax:plan.pidsMax,networkNamespaceRequired:true,
    chrootRequired:true,dropUid:65534,storageQuotaEnforced:false,
    kernelObservedHere:false,execution:"GITHUB_HOSTED_CI_ONLY"};
 }
 return {kind:"PEF_M55_ISOLATION_CONTRACT_V1",ok:true,status:"LAB_PASS_CONTRACT_ONLY",
   profiles,driver:"src/adapters/linux-isolated-process-driver.js",
   ciHarness:"scripts/lab/workload-isolation-smoke.sh",
   requiredEvidenceKind:"PEF_M55_KERNEL_OVERLAYS_V1",
   macKernelTest:"NOT_RUN_BLOCKED",hardwareValidated:false,
   linuxKernelLimitsObservedHere:false,physicalPowerCutValidated:false};
}
module.exports={runM55IsolationContract};
