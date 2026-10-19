"use strict";
// Read-only dashboard inspection; privileged kernel integration is CI-only.
const {collect}=require("./m5-install.js");
const {makeLinuxIsolationPlan}=require("../adapters/linux-workload-isolation.js");
const {propertyManifest,hostManifest}=require("./demo-workload.js");
const {runM54ServiceContract}=require("./m5-systemd-unit.js");
function runM56IntegrationInspection(){
 const items=collect(),systemd=runM54ServiceContract();
 const packaged=items.some(x=>x.path==="bin/pef-m56-edge.js");
 const profilePlans={};
 for(const [name,m] of [["property",propertyManifest()],["host",hostManifest()]]){
   const plan=makeLinuxIsolationPlan(m);
   profilePlans[name]={workloadId:plan.workloadId,cpuMax:plan.cpuMax,
     memoryMax:plan.memoryMax,pidsMax:plan.pidsMax,
     kernelEnforcedLocally:false};
 }
 const checks={PACKAGED_LAB_ENTRYPOINT:packaged,
   SYSTEMD_UNIT_CONTRACT:systemd.ok===true,
   PROPERTY_ISOLATION_PLAN:profilePlans.property.workloadId==="pef-property",
   HOST_ISOLATION_PLAN:profilePlans.host.workloadId==="pef-host"};
 const ok=Object.values(checks).every(Boolean);
 return {kind:"PEF_M56_INTEGRATION_INSPECTOR_V1",status:ok?"LAB_PASS_CONTRACT_ONLY":"BLOCKED",
   ok,checks,profilePlans,expectedCiEvidence:"PEF_M56_INTEGRATED_SYSTEMD_KERNEL_LAB_V1",
   ciHarness:"scripts/lab/m56-systemd-kernel-smoke.sh",
   ciOnlyRootDriver:true,localKernelExecution:"NOT_RUN_BLOCKED",
   systemdActivatedLocally:false,
   completeVmRebootWithKernelWorkerValidated:false,
   productionAuthorized:false,hardwareValidated:false,cloudMockOnly:true,
   note:"Inspection does not activate systemd, cgroups or netns. Download CI evidence to inspect actual enforcement."};
}
module.exports={runM56IntegrationInspection};
