"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM56IntegrationInspection}=require("../src/runtime/m56-integration-contract.js");
test("M5.6 packaged systemd and kernel policy inspection stays read-only on Mac",()=>{
 const x=runM56IntegrationInspection();
 assert.equal(x.ok,true);
 assert.equal(x.status,"LAB_PASS_CONTRACT_ONLY");
 assert.equal(Object.values(x.checks).every(Boolean),true);
 assert.equal(x.profilePlans.property.cpuMax,"15000 100000");
 assert.equal(x.profilePlans.host.memoryMax,"83886080");
 assert.equal(x.localKernelExecution,"NOT_RUN_BLOCKED");
 assert.equal(x.systemdActivatedLocally,false);
 assert.equal(x.completeVmRebootWithKernelWorkerValidated,false);
});
