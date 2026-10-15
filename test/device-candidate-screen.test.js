"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluateShortlist,evaluateCandidate,evaluatePhysicalAcceptance}=require("../src/runtime/hardware-screening.js");
const {observeHost,percentile}=require("../src/runtime/device-observation.js");
const {runCandidateScreening}=require("../src/runtime/device-candidate-screen.js");
const fixture=require("../docs/contracts/hardware-shortlist-v1.json");
test("C2 shortlist has explicit non-mixed currencies, incomplete BOM and evidence gaps",()=>{
 const r=evaluateShortlist();
 assert.equal(r.ok,true);assert.equal(r.candidates.length,3);
 assert.deepEqual(r.firstInvestigationCandidates,["nanopi-r5s-lts-4gb"]);
 for(const item of r.candidates){
   assert.equal(item.cost.totalCost,null);
   assert.ok(item.cost.unknownRequiredComponents.length>0);
   assert.equal(item.hardwareValidated,false);
 }
 assert.equal(r.candidates[0].cost.knownSubtotal,143);
 assert.equal(r.candidates[0].cost.currency,"USD");
 assert.equal(r.candidates[1].cost.knownSubtotal,108.54);
 assert.equal(r.candidates[2].screening.ram,"DOCUMENTED_BELOW_MIN");
 assert.equal(r.physicallyMeasured,false);
 assert.equal(fixture.hardAcceptance.allNotRun,true);
});
test("C2 price mismatch, malformed candidate and forged pass do not grant hardware",()=>{
 const bad=structuredClone(fixture.candidates[0]);
 bad.billOfMaterials[0].currency="EUR";
 assert.throws(()=>evaluateCandidate(bad),/C2_MIXED_CURRENCY_BOM/);
 bad.billOfMaterials[0].currency="USD";bad.billOfMaterials[0].price=-1;
 assert.throws(()=>evaluateCandidate(bad),/C2_INVALID_BOM/);
 assert.throws(()=>evaluateShortlist({candidates:[]}),/C2_CANDIDATE_SET_INVALID/);
 const p=evaluatePhysicalAcceptance({SIGNED_DEVICE_PROVENANCE:true,REAL_POWER_CUT_STORAGE:true});
 assert.equal(p.canEnableDevice,false);
 assert.ok(p.required.every(x=>x.verified===false&&x.state==="NOT_RUN"));
 assert.equal(p.required.filter(x=>x.selfReported).length,2);
});
test("C2 host collector measures only safe temporary fsync and never invents watts",()=>{
 const r=observeHost({samples:3});
 assert.equal(r.status,"LAB_PASS",JSON.stringify(r));
 assert.equal(r.sampleCount,3);assert.equal(r.journal.ackAndFsync,3);
 assert.equal(r.journal.reopenRetained,3);
 assert.equal(r.boardIdleWatts,null);assert.equal(r.networkThroughputMbps,null);
 assert.equal(r.actualPowerCutRecovered,null);assert.equal(r.hostRoutesChanged,false);
 assert.equal(r.physicalValidated,false);
 assert.equal(percentile([1,2,3,4],.95),3);
 assert.throws(()=>observeHost({samples:100}),/C2_INVALID_SAMPLE_COUNT/);
});
test("C2 report retains DEVICE_BLOCKED and does not convert CI host results into a device",()=>{
 const r=runCandidateScreening({samples:3});
 assert.equal(r.status,"LAB_PASS_PHYSICAL_BLOCKED");
 assert.equal(r.physical.canEnableDevice,false);
 assert.equal(r.shortlist.deviceBackend,"BACKEND_NOT_IMPLEMENTED");
 assert.equal(r.recommendationStatus,"PROVISIONAL_NO_PROCUREMENT_APPROVAL");
 assert.equal(r.observation.deviceQualified,false);
});
