"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluate}=require("../src/runtime/arm64-e-final-gate.js");
const topology=require("../docs/contracts/pef-r28s-e4-topology-v1.json");
const evidence=()=>({
 d4:{kind:"PEF_ARM64_VIRTUAL_FIT_COMPARISON_V1",ok:true,profile:"r28s-1g",
   checks:Array.from({length:7},()=>({pass:true})),limits:{procurementApproved:false}},
 e1:{kind:"PEF_E1_GUEST_RESOURCE_ENVELOPE_V1",ok:true,profile:"r28s-1g",
   guest:{profileEnforced:true},probe:{provisionalMemoryHeadroomOk:true,anyOomKilled:false,minAvailableMiB:160}},
 e2Small:{kind:"PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1",ok:true,profile:"r28s-1g",
   measured:{payloadKiB:1,acked:2000,recovered:2000},model:{eventCount:518400,estimatedJournalGiB:0.61},
   decisions:{seventyTwoHourOfflineAcceptance:false},limits:{physicalValidated:false}},
 e2Large:{kind:"PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1",ok:true,profile:"r28s-1g",
   measured:{payloadKiB:4,acked:1000,recovered:1000},model:{eventCount:518400,estimatedJournalGiB:2.2},
   decisions:{seventyTwoHourOfflineAcceptance:false},limits:{physicalValidated:false}}
});
test("E4 prioritizes existing router, never invents USB NIC or 3 native Ethernet",()=>{
 assert.equal(topology.nativeEthernetPorts,2);
 assert.equal(topology.decision,"CORE_BEHIND_EXISTING_ROUTER");
 assert.equal(topology.usbHostProven,false);
 assert.equal(topology.completeDeviceCostVerified,false);
});
test("E5 complete operator virtual set remains research-only not hardware or 72h qualified",()=>{
 const r=evaluate(evidence());
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.checks.length,5);
 assert.equal(r.limitations.procurementApproved,false);
 assert.equal(r.limitations.seventyTwoHoursOfflineValidated,false);
});
test("E5 does not elevate missing E1 or 4KiB or a forged D4 procurement claim",()=>{
 for(const fault of [
  e=>e.e1=undefined,
  e=>e.e2Large.measured.recovered=900,
  e=>e.d4.limits.procurementApproved=true,
  e=>e.e1.guest.profileEnforced=false
 ]){
  const e=evidence();fault(e);
  assert.equal(evaluate(e).ok,false);
 }
});
