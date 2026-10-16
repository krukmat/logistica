"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assertArm64VmNetns}=require("../src/adapters/arm64-vm-netns-ports.js");
test("D2.2 VM netns adapter refuses test harness without Linux ARM64 guest root opt-in",()=>{
 assert.throws(()=>assertArm64VmNetns({edge:"pef-test-edge",a:"pef-test-a",b:"pef-test-b"}),/ARM64_VM_NETNS_BLOCKED/);
});
