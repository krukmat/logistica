"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runJournalScale}=require("../src/runtime/arm64-f1-journal-scale.js");
test("F1 CI smoke scales 100/500/1000 events with reopen, dedup and bounded cleanup",async()=>{
 const r=await runJournalScale();
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.stages.map(x=>x.events),[100,500,1000]);
 assert.equal(r.completedEvents,1000);
 assert.ok(r.stages.every(x=>x.duplicateRetained&&x.conflictBlocked&&x.readMode==="STREAMING_64K"));
 assert.equal(r.safety.full518400EventsTested,false);
 assert.equal(r.safety.tempDirectoryDeleted,true);
});
test("F1 refuses 100K without both real constrained guest and explicit ack",async()=>{
 await assert.rejects(runJournalScale({mode:"full"}),/F1_FULL_REQUIRES_CONSTRAINED_VM_AND_EXPLICIT_ACK/);
 await assert.rejects(runJournalScale({mode:"full",ack:"R28S_1GB_STAGED_TEST"}),/F1_FULL_REQUIRES_CONSTRAINED_VM_AND_EXPLICIT_ACK/);
});
