"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),os=require("node:os");
const {snapshot,runResourceEnvelope}=require("../src/runtime/arm64-resource-envelope.js");
const {modelBacklog,runOfflineEnvelope}=require("../src/runtime/arm64-offline-envelope.js");
test("E1 read-only metric snapshot does not claim kernel enforcement",()=>{
 const s=snapshot();assert.equal(typeof s.processRssMiB,"number");
 assert.equal(typeof s.linuxArm64,"boolean");
 if(s.cgroup.available)assert.equal(s.cgroup.kernelMemoryLimitVerified,false);
});
test("E1 bounded process child probe reports headroom without claiming 1GiB on CI",async()=>{
 if(process.platform!=="linux")return;
 const r=await runResourceEnvelope({probeMiB:8});
 assert.equal(r.probe.isolatedByCgroups,false);
 assert.equal(r.limits,undefined);
 assert.equal(r.limitations.physicalValidated,false);
});
test("E2 72h capacity model conservatively represents 518400 events",()=>{
 const a=modelBacklog({payloadKiB:1}),b=modelBacklog({payloadKiB:4});
 assert.equal(a.eventCount,518400);assert.equal(b.eventCount,518400);
 assert.ok(b.rawPayloadGiB>a.rawPayloadGiB);
 assert.throws(()=>modelBacklog({payloadKiB:16}),/E2_INVALID_MODEL/);
});
test("E2 bounded OS journal fsync + normal reopen preserves all receipts, not 72h",async()=>{
 const r=await runOfflineEnvelope({count:20,payloadKiB:1});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.measured.acked,20);assert.equal(r.measured.recovered,20);
 assert.equal(r.decisions.seventyTwoHourOfflineAcceptance,false);
 assert.ok(r.model.estimatedJournalGiB>r.model.rawPayloadGiB);
 assert.equal(r.limits.physicalValidated,false);
});

test("E2 reports measured fsync p95 and bounded reader identity",async()=>{
 const r=await runOfflineEnvelope({count:12,payloadKiB:4});
 assert.equal(r.ok,true);assert.ok(r.measured.fsyncAppendMs.p95>=0);
 assert.ok(r.measured.fsyncAppendMs.p99>=r.measured.fsyncAppendMs.p95);
 assert.equal(r.measured.reopenReadMode,"STREAMING_64K");
});
