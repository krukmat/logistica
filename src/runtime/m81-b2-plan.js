"use strict";
// M8.1.B2 — static guest workload plan + bounded, untrusted evidence inspection.
// Does not grant VM permissions or invoke privileged Linux commands.
const {makeLinuxIsolationPlan}=require("../adapters/linux-workload-isolation.js");
const {propertyManifest,hostManifest}=require("./demo-workload.js");
const PROFILES=Object.freeze(["property","host"]);
const EVIDENCE_KIND="PEF_M81_B2_GUEST_STACK_V1";
const REQUIRED=["GUEST_SCOPE_AUTHORIZED","BOTH_WORKERS_ISOLATED",
 "MANIFEST_CGROUP_LIMITS","WORKER_UID_AND_NETNS",
 "LOCAL_INCIDENT_FSYNC","CLOUD_TLS13_MTLS",
 "OFFLINE_QUEUE_REPLAY","LOCAL_CLOUD_AND_BOTH_EDGES_CONCURRENT"];
function createM81B2Plan(){
 const profiles=Object.fromEntries(PROFILES.map(profile=>{
  const p=makeLinuxIsolationPlan(profile==="property"?propertyManifest():hostManifest());
  return [profile,{workloadId:p.workloadId,cpuMax:p.cpuMax,memoryMax:p.memoryMax,
   swapMax:p.memorySwapMax,pidsMax:p.pidsMax,storageQuotaEnforced:false}];
 }));
 return {kind:"PEF_M81_B2_PLAN_V1",task:"M8.1.B2",status:"GUEST_NOT_RUN",
  ok:false,profile:"pef-r28s-1g",runtimeScope:"M81_LIMA_VM",profiles,
  requiredChecks:[...REQUIRED],
  isolation:"ROOT_OWNED_DISPOSABLE_CGROUP_NETNS_CHROOT",
  cloud:"TLS13_MTLS_LOOPBACK_ONLY",
  privilegedGuestOptInRequired:true,
  systemdManagedValidated:false,vmRebootValidated:false,
  fieldPilotAuthorized:false,physicalValidated:false,
  localArtifactsOnly:true,guestModificationPerformed:false,
  readyForM81C:false,
  nextGate:"M8.1.C: verified systemd lifecycle and guest restart/recovery"};
}
function inspectM81B2Evidence(report){
 const reject=reason=>({kind:"PEF_M81_B2_EVIDENCE_INSPECTION_V1",status:"REJECTED",
  accepted:false,reason,provenance:"OPERATOR_JSON_UNATTESTED",
  integrityVerified:false,physicalValidated:false,readyForM81C:false});
 if(!report||typeof report!=="object"||Array.isArray(report)||
  report.kind!==EVIDENCE_KIND||report.task!=="M8.1.B2"||
  report.profile!=="pef-r28s-1g"||report.physicalValidated!==false||
  report.productionAuthorized!==false||report.vmRebootValidated!==false||
  report.systemdManagedValidated!==false||typeof report.checks!=="object"||
  !report.checks||Array.isArray(report.checks))
  return reject("INVALID_REPORT_SCOPE");
 if(Object.keys(report.checks).length!==REQUIRED.length||
    REQUIRED.some(k=>typeof report.checks[k]!=="boolean")||
    Object.keys(report.checks).some(k=>!REQUIRED.includes(k)))
  return reject("INVALID_CHECK_SET");
 const statuses=PROFILES.map(name=>report.workloads?.[name]);
 if(statuses.some((x,i)=>!x||x.workloadId!=="pef-"+PROFILES[i]||
  x.isolation!=="LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM"||
  x.actualLimitsEnforced!==true||!Number.isSafeInteger(x.pid)||x.pid<2||
  !Number.isSafeInteger(x.memoryPeakBytes)||x.memoryPeakBytes<1||
  x.memoryPeakBytes> (PROFILES[i]==="property"?67108864:83886080)))
  return reject("INVALID_WORKER_EVIDENCE");
 if(report.ok!==true||report.status!=="LAB_PASS"||
  REQUIRED.some(k=>report.checks[k]!==true))
  return reject("INCOMPLETE_OR_FAILED_GUEST_CHECKS");
 if(report.cleanup?.status!=="PASS"||report.cleanup?.ownedResourcesRemoved!==true)
  return reject("CLEANUP_NOT_VERIFIED");
 return {kind:"PEF_M81_B2_EVIDENCE_INSPECTION_V1",
  status:"OPERATOR_REPORTED_UNATTESTED",accepted:true,
  provenance:"OPERATOR_JSON_UNATTESTED",integrityVerified:false,
  schemaChecksValidated:true,physicalValidated:false,readyForM81C:false,
  guestKernelEvidenceIndependentlyVerified:false,
  systemdManagedValidated:false,vmRebootValidated:false,
  workerCount:statuses.length};
}
module.exports={createM81B2Plan,inspectM81B2Evidence,REQUIRED,EVIDENCE_KIND};
