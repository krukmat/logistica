"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessGuest,runArm64VmProfile}=require("../src/runtime/arm64-vm-profile.js");
test("D1 profile is ARM64 + truly limited RAM, never CI with 16 GiB",()=>{
 assert.equal(assessGuest({profile:"r28s-1g",platform:"linux",arch:"arm64",memoryMiB:970,cpuCount:4}).profileEnforced,true);
 assert.equal(assessGuest({profile:"r28s-1g",platform:"linux",arch:"arm64",memoryMiB:16384,cpuCount:4}).profileEnforced,false);
 assert.equal(assessGuest({profile:"r28s-1g",platform:"darwin",arch:"arm64",memoryMiB:1024,cpuCount:4}).profileEnforced,false);
 assert.throws(()=>assessGuest({profile:"unknown"}),/UNKNOWN_ARM64_VM_PROFILE/);
});
test("D2 existing Core fsync + reopening and pinned Golden Traces",async()=>{
 const r=await runArm64VmProfile({count:5});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.resource.accepted,5);
 assert.equal(r.resource.recovered,5);
 assert.equal(r.golden.ok,true);
 assert.equal(r.safety.physicalValidated,false);
});
