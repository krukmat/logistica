"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {compareArm64Evidence}=require("../src/runtime/arm64-lab-compare.js");
const traces=require("../docs/contracts/golden-traces-v1.json");
const pinned=createHash("sha256").update(JSON.stringify(traces.scenarios)).digest("hex");
const evidence=()=>({
 core:{kind:"PEF_ARM64_VM_LAB_REPORT_V1",ok:true,
  guest:{profile:"r28s-1g",profileEnforced:true,observed:{platform:"linux",arch:"arm64",memoryMiB:972}},
  golden:{ok:true,scenarioCount:4,baselineSha256:pinned,canonicalSha256:pinned},
  resource:{accepted:50,recovered:50,error:null,processWithinHalfGuestRam:true,sampledProcessPeakRssMiB:54}},
 network:{kind:"PEF_ARM64_VM_NETNS_CORE",ok:true,status:"VM_NETNS_LAB_PASS",
  steps:[{selectedWan:"primary"},{selectedWan:"backup"},{selectedWan:null},{selectedWan:"primary"}],
  physicalValidated:false,hostRoutesChanged:false,virtualInterfaces:3},
 recovery:{kind:"PEF_ARM64_D3_RECOVERY_V1",ok:true,status:"VM_FORCED_STOP_RECOVERY_OPERATOR_REPORTED",
  evidenceOrigin:"LIMA_FORCE_STOP_HOST_CLI_SELF_REPORTED",expected:120,retained:120,
  duplicateDetected:true,conflictBlocked:true,writerStillLive:false,physicalValidated:false},
 load:{kind:"PEF_ARM64_VM_LAB_REPORT_V1",ok:true,
  guest:{profile:"r28s-1g",profileEnforced:true},
  resource:{accepted:2000,recovered:2000,receiptPerSecond:500,
   processWithinHalfGuestRam:true}}
});
test("D4 only an evidence-complete constrained ARM64 virtual result is promising; never hardware GO",()=>{
 const r=compareArm64Evidence(evidence());
 assert.equal(r.ok,true);assert.equal(r.checks.length,7);
 assert.equal(r.verdict,"R28S_1GB_CORE_ONLY_PROMISING");
 assert.equal(r.limits.procurementApproved,false);
 assert.equal(r.limits.deviceBackend,"BACKEND_NOT_IMPLEMENTED");
});
test("D4 refuses missing D3, forged SHA, unconstrained RAM and insufficient load",()=>{
 for(const change of [
  d=>{d.recovery=undefined;},
  d=>{d.core.golden.canonicalSha256="wrong";},
  d=>{d.core.guest.profileEnforced=false;},
  d=>{d.load.resource.accepted=200;d.load.resource.recovered=200;},
  d=>{d.network.steps[2].selectedWan="backup";},
  d=>{d.recovery.evidenceOrigin="CLAIMED_DEVICE_PASS";}
 ]){
  const input=evidence();change(input);
  const report=compareArm64Evidence(input);
  assert.equal(report.ok,false);assert.equal(report.verdict,"HARDWARE_DECISION_BLOCKED");
 }
 assert.throws(()=>compareArm64Evidence({profile:"unknown"}),/D4_UNKNOWN_PROFILE/);
});
