"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {model}=require("../src/runtime/arm64-f2-retention-policy.js");
const inputs=()=>({
 f1:{kind:"PEF_F1_JOURNAL_INDEX_SCALE_V1",ok:true,mode:"full",profile:"r28s-1g",
   guest:{profileEnforced:true},error:null,
   stages:[{events:10000,nodeRssMiB:80},{events:50000,nodeRssMiB:140},
     {events:100000,nodeRssMiB:220,guestMemAvailableMiB:300}],
   safety:{physicalValidated:false}},
 e2Small:{kind:"PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1",ok:true,profile:"r28s-1g",
   measured:{payloadKiB:1,bytesPerEvent:1290},model:{eventCount:518400},
   decisions:{seventyTwoHourOfflineAcceptance:false}},
 e2Large:{kind:"PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1",ok:true,profile:"r28s-1g",
   measured:{payloadKiB:4,bytesPerEvent:4360},model:{eventCount:518400},
   decisions:{seventyTwoHourOfflineAcceptance:false}}
});
test("F2 projects 72h for 1K/4K events but blocks current 100MiB journal and hardware approval",()=>{
 const r=model(inputs());assert.equal(r.ok,true);
 assert.equal(r.projections.payload1KiB.events,518400);
 assert.equal(r.decision.currentEdge100MiBCapBlocks72h,true);
 assert.equal(r.projections.payload1KiB.currentEdgeCapSufficient,false);
 assert.ok(r.projections.payload4KiB.estimatedJournalGiB>r.projections.payload1KiB.estimatedJournalGiB);
 assert.equal(r.decision.proposedPhysical72hAcceptance,false);
 assert.equal(r.decision.procurementApproved,false);
});
test("F2 never marks incomplete missing or mismatched raw sources as tested",()=>{
 const a=inputs();delete a.e2Large;
 const r=model(a);assert.equal(r.ok,false);
 assert.equal(r.projections.payload4KiB,null);
 const b=inputs();b.f1.mode="smoke";b.f1.guest.profileEnforced=false;
 assert.equal(model(b).checks.find(x=>x.name==="F2_F1_REAL_1GB_100K").pass,false);
});
