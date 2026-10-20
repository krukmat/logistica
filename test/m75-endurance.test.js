"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM75ShortSoak,runM75LongSoak}=require("../src/runtime/m75-endurance.js");
test("M7.5 short real Cloud Lite fault/stress runs don't masquerade as 2–24h longevity",async()=>{
 const result=await runM75ShortSoak({cycles:2});
 assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
 assert.equal(result.twoHourSoakValidated,false);
 assert.equal(result.p0p1SeventyTwoHourRetentionValidated,false);
 assert.equal(result.cycles,2);
});
test("M7.5 long-soak requires explicit opt-in and accepted duration",async()=>{
 await assert.rejects(runM75LongSoak({hours:2}),/M75_LONG_SOAK_OPERATOR_ACK_REQUIRED/);
 await assert.rejects(runM75LongSoak({hours:1,approval:"EXPLICIT_OPERATOR_LONG_SOAK_LOCAL"}),
  /M75_LONG_SOAK_OPERATOR_ACK_REQUIRED/);
});

test("M7.5 captures parent process resource vector per cycle and checks replay, not elapsed time",async()=>{
 const r=await runM75ShortSoak({cycles:1});
 assert.equal(r.checks.REPLAY_NO_DATA_LOSS,true);
 assert.equal(r.resourceSamples.length,2);
 assert.equal(r.resourceAttribution,"HARNESS_PARENT_ONLY");
 assert.equal(r.workerRssValidated,false);
 for(const m of r.resourceSamples){
  for(const k of ["at","pid","rssBytes","heapUsedBytes","heapTotalBytes",
   "externalBytes","arrayBuffersBytes"])assert.equal(Number.isSafeInteger(m[k]),true,k);
  assert.equal(typeof m.activeResources,"object");
 }
});

test("M7.5.E rejects oversized/unbounded continuous run in a local process",async()=>{
 const {runM75Sustained}=require("../src/runtime/m75-sustained.js");
 await assert.rejects(runM75Sustained({durationSeconds:1801}),/M75_SUSTAINED_LIMITS_INVALID/);
 await assert.rejects(runM75Sustained({durationSeconds:3}),/M75_SUSTAINED_LIMITS_INVALID/);
});
test("M7.5.E sustained local TLS cloud and both Edge hosts survive outage and reopen",async()=>{
 const {runM75Sustained}=require("../src/runtime/m75-sustained.js");
 const result=await runM75Sustained({durationSeconds:6,intervalMs:650});
 assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
 assert.equal(result.checks.REAL_HTTP_CLOUD_OUTAGE_OBSERVED,true);
 assert.equal(result.checks.CLOUD_LEDGER_REOPEN_MATCHES,true);
 assert.equal(result.checks.EDGE_REOPEN_RETAINS_ACK,true);
 assert.equal(result.sameLongLivedEdgeAndCloud,true);
 assert.equal(result.physicalValidated,false);
 assert.ok(result.resourceSamples.length>=4);
 assert.equal(result.checks.WORKER_PROCESS_RSS_ATTRIBUTED,true);
 assert.equal(result.workerRssValidated,true);
 assert.equal(result.edgeCloudRssSeparatelyValidated,false);
 assert.equal(result.parentHostsEdgeAndCloud,true);
 assert.equal(result.workerProcessMetrics.distinctWorkerPids,true);
 assert.equal(result.workerProcessMetrics.workers.length,2);
 const pids=new Set();
 for(const worker of result.workerProcessMetrics.workers){
  assert.ok(worker.pid>0&&worker.pid!==process.pid);
  assert.ok(worker.samples>=4);
  assert.ok(worker.firstRssBytes>0&&worker.lastRssBytes>0);
  pids.add(worker.pid);
 }
 assert.equal(pids.size,2);
 for(const sample of result.resourceSamples){
  assert.ok(sample.workers.property.pid>0&&sample.workers.host.pid>0);
  assert.ok(sample.workers.property.pid!==sample.workers.host.pid);
  for(const profile of ["property","host"]){
   const worker=sample.workers[profile];
   assert.equal(worker.isolation,"NODE_PROCESS_ONLY");
   assert.equal(worker.actualLimitsEnforced,false);
   for(const k of ["rssBytes","heapUsedBytes","heapTotalBytes","externalBytes",
     "arrayBuffersBytes","cpuUserMicros","cpuSystemMicros"])
    assert.ok(Number.isSafeInteger(worker[k])&&worker[k]>=0,k);
  }
 }
});
