"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {runM4Commonality,measureSource,fixtureParity,simulatePolicyFaults,storageFaults}=require("../src/runtime/m4-commonality.js");
const {propertyManifest,hostManifest}=require("../src/runtime/demo-workload.js");
test("M4.3.1 original Property events remain readable and separate from Host/identity",async()=>{
 const r=await fixtureParity();
 assert.equal(r.status,"LAB_PASS",JSON.stringify(r));
 assert.equal(Object.values(r.checks).every(Boolean),true);
 assert.equal(r.retained,2);
});
test("M4.3.2 resource/admission, bounded retry and fail-closed injected fsync for both",async()=>{
 for(const profile of ["property","host"]){
   const sup=await simulatePolicyFaults(profile);
   assert.equal(sup.status,"LAB_PASS",profile+":"+JSON.stringify(sup));
   assert.equal(sup.checks.EXHAUSTION_ISOLATES,true);
   assert.equal(sup.checks.UNTRUSTED_DENIED,true);
   const storage=await storageFaults(profile);
   assert.equal(storage.status,"LAB_PASS",profile+":"+JSON.stringify(storage));
   assert.equal(storage.checks.FSYNC_FAILURE_NO_ACK,true);
   assert.equal(storage.physicalPowerCutValidated,false);
 }
});
test("M4.3.3 scoped LOC evidence includes all declared shared sources and avoids fake whole-product ratio",()=>{
 const report=measureSource();
 assert.equal(report.kind,"PEF_M4_SCOPED_SOURCE_METRICS_V1");
 assert.ok(report.sharedFiles>=8);
 assert.ok(report.sharedLines>report.propertyCompatibilityLines);
 assert.equal(report.hostSpecificFiles,0);
 assert.equal(report.unusedLegacyCandidates,1);
 assert.ok(report.selectedRuntimeSharePercent>0&&report.selectedRuntimeSharePercent<=100);
 assert.equal(report.selectedPaths.every(x=>fs.existsSync(path.resolve(__dirname,"..",x.path))),true);
 assert.match(report.ratioScope,/NOT_WHOLE_PRODUCT_REUSE/);
 assert.deepEqual(["property","host"].map(p=>p==="property"?propertyManifest().connectivity_mode:
   hostManifest().connectivity_mode),["LOCAL_ONLY_CAPABLE","LOCAL_ONLY_CAPABLE"]);
});
test("M4.3 real dual-overlay child crash, restart, ACK ambiguity and observed metrics",async()=>{
 const report=await runM4Commonality();
 assert.equal(report.status,"LAB_PASS",JSON.stringify(report));
 assert.equal(report.ok,true);
 for(const profile of ["property","host"]){
   const p=report.profiles[profile];
   assert.equal(p.passed,true);
   assert.equal(p.runtime.checks.REAL_CHILD_RESTART,true);
   assert.equal(p.runtime.checks.FAIL_CLOSED_WHILE_DOWN,true);
   assert.equal(p.runtime.checks.LOST_REMOTE_ACK_RETAINED,true);
   assert.equal(p.runtime.checks.MOCK_DUPLICATE_REPLAY,true);
   assert.equal(p.supervisor.checks.HEALTH_FAIL_BACKOFF,true);
   assert.equal(p.storage.checks.UNSAFE_LOCKS_OUT,true);
   assert.equal(p.runtime.isolation,"NODE_PROCESS_ONLY");
   assert.equal(p.runtime.actualLimitsEnforced,false);
   const m=p.runtime.observedMetrics;
   for(const key of ["workerBefore","workerAfter"]){
     assert.ok(m[key].rssBytes>0&&Number.isSafeInteger(m[key].rssBytes));
     assert.ok(m[key].cpuUserMicros>=0&&Number.isSafeInteger(m[key].cpuUserMicros));
     assert.equal(m[key].kernelLimitsEnforced,false);
   }
   for(const key of ["openHttpMs","ackHttpMs","restartObserveMs","journalBytesBeforeReopen",
       "journalBytesAfterReplay"])assert.ok(Number.isFinite(m[key])&&m[key]>=0,key);
 }
 assert.equal(report.hardwareValidated,false);
 assert.equal(report.propertyHostLinuxIsolationValidated,false);
 assert.equal(report.remoteCloudProvisioned,false);
});
