"use strict";
// Verify structure of independently obtained CI reports; no cryptographic signature claim.
const EXPECTED=Object.freeze({
 property:{cpu:"15000 100000",memory:"67108864"},
 host:{cpu:"18000 100000",memory:"83886080"}
});
const CHECKS=["PACKAGED_RELEASE","SYSTEMD_REAL_SERVICE","PROFILE_MATCH","KERNEL_ENFORCED",
  "MANIFEST_QUOTAS","DURABLE_ALERT_AND_ACK","NEW_SESSION_AFTER_SYSTEMD_RESTART",
  "JOURNAL_RECOVERED","LOCAL_ONLY","STORAGE_NOT_UNSAFE"];
function verifyM56Report(report){
 if(!report||report.kind!=="PEF_M56_INTEGRATED_SYSTEMD_KERNEL_LAB_V1"||
  report.ok!==true||report.status!=="LAB_PASS"||
  report.releaseVerified!==true||report.combinedKernelSystemdValidated!==true||
  report.servicedBy!=="ACTUAL_GITHUB_HOSTED_LINUX_SYSTEMD_PID1"||
  report.physicalValidated!==false||report.vmRebootValidated!==false||
  report.productionAuthorized!==false||report.cloudMockOnly!==true)
  throw Error("M56_EVIDENCE_HEADER_INVALID");
 let count=0;
 for(const [profile,budget] of Object.entries(EXPECTED)){
  const item=report.profiles?.[profile];
  if(!item||item.kind!=="PEF_M56_SYSTEMD_KERNEL_PROFILE_V1"||item.profile!==profile||
    item.ok!==true||item.status!=="LAB_PASS"||
    item.quotas?.cpu!==budget.cpu||item.quotas?.memory!==budget.memory||
    item.quotas?.pids!=="16"||item.hostedCiOnly!==true||
    item.physicalValidated!==false||item.systemRebootValidated!==false||
    item.storageQuotaEnforced!==false||item.cloud!=="LOCAL_MOCK")
    throw Error("M56_EVIDENCE_PROFILE_INVALID:"+profile);
  if(!item.checks||Object.keys(item.checks).length!==CHECKS.length||
    CHECKS.some(k=>item.checks[k]!==true))
    throw Error("M56_EVIDENCE_ASSERTIONS_INVALID:"+profile);
  count+=CHECKS.length;
 }
 if(Object.keys(report.profiles).length!==2)throw Error("M56_EVIDENCE_EXTRA_PROFILE");
 return {kind:"PEF_M56_EVIDENCE_VERIFIED_V1",status:"LAB_PASS",ok:true,
  assertions:count,profiles:2,scope:"SCHEMA_AND_LAB_CLAIMS_ONLY",
  cryptographicAuthenticityVerified:false,realVmRebootValidated:false,physicalValidated:false};
}
module.exports={verifyM56Report};
