"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM55IsolationContract}=require("../src/runtime/m5-isolation-contract.js");
test("M5.5 dashboard-safe inspector never represents synthetic profile budgets as observed local enforcement",()=>{
 const x=runM55IsolationContract();
 assert.equal(x.ok,true);
 assert.equal(x.status,"LAB_PASS_CONTRACT_ONLY");
 assert.equal(x.profiles.property.cpuMax,"15000 100000");
 assert.equal(x.profiles.host.cpuMax,"18000 100000");
 assert.equal(x.profiles.host.kernelObservedHere,false);
 assert.equal(x.macKernelTest,"NOT_RUN_BLOCKED");
 assert.equal(x.hardwareValidated,false);
});
