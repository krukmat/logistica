"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifyM56Report}=require("../src/runtime/m56-evidence.js");
const checks=["PACKAGED_RELEASE","SYSTEMD_REAL_SERVICE","PROFILE_MATCH","KERNEL_ENFORCED",
"MANIFEST_QUOTAS","DURABLE_ALERT_AND_ACK","NEW_SESSION_AFTER_SYSTEMD_RESTART",
"JOURNAL_RECOVERED","LOCAL_ONLY","STORAGE_NOT_UNSAFE"];
function fake(){
 const profiles={};
 for(const [name,cpu,memory] of [["property","15000 100000","67108864"],
  ["host","18000 100000","83886080"]]){
  profiles[name]={kind:"PEF_M56_SYSTEMD_KERNEL_PROFILE_V1",profile:name,ok:true,
   status:"LAB_PASS",checks:Object.fromEntries(checks.map(x=>[x,true])),
   quotas:{cpu,memory,pids:"16"},hostedCiOnly:true,physicalValidated:false,
   systemRebootValidated:false,storageQuotaEnforced:false,cloud:"LOCAL_MOCK"};
 }
 return {kind:"PEF_M56_INTEGRATED_SYSTEMD_KERNEL_LAB_V1",ok:true,
  status:"LAB_PASS",releaseVerified:true,combinedKernelSystemdValidated:true,
  servicedBy:"ACTUAL_GITHUB_HOSTED_LINUX_SYSTEMD_PID1",
  physicalValidated:false,vmRebootValidated:false,productionAuthorized:false,
  cloudMockOnly:true,profiles};
}
test("M5.6 evidence requires both isolated worker profiles and all service/journal checks",()=>{
 const x=fake();
 assert.equal(verifyM56Report(x).assertions,20);
 assert.equal(verifyM56Report(x).cryptographicAuthenticityVerified,false);
 for(const field of ["JOURNAL_RECOVERED","KERNEL_ENFORCED","PACKAGED_RELEASE"]){
  const t=fake();t.profiles.property.checks[field]=false;
  assert.throws(()=>verifyM56Report(t),/M56_EVIDENCE_ASSERTIONS_INVALID/);
 }
 const wrong=fake();wrong.profiles.host.quotas.cpu="15000 100000";
 assert.throws(()=>verifyM56Report(wrong),/M56_EVIDENCE_PROFILE_INVALID/);
 const extra=fake();extra.profiles.spoof={};
 assert.throws(()=>verifyM56Report(extra),/M56_EVIDENCE_EXTRA_PROFILE/);
 const physical=fake();physical.physicalValidated=true;
 assert.throws(()=>verifyM56Report(physical),/M56_EVIDENCE_HEADER_INVALID/);
});
