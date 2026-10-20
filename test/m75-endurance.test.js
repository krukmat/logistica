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
