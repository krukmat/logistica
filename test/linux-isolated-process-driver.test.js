"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createLinuxIsolatedProcessDriver}=require("../src/adapters/linux-isolated-process-driver.js");
const {makeLinuxIsolationPlan}=require("../src/adapters/linux-workload-isolation.js");
const {demoManifest}=require("../src/runtime/demo-workload.js");
test("S3.4 CI-only Linux driver refuses non-ephemeral or unprivileged hosts before spawn",()=>{
  assert.throws(()=>createLinuxIsolatedProcessDriver({
    namespace:"pef-s3-123-42",cgroup:"/sys/fs/cgroup/pef-s3-123-42",
    rootfs:"/tmp/x",nodeInside:"/usr/bin/node"
  }),/LAB_BLOCKED/);
});
test("S3.4 plan enforces RAM, zero swap, CPU and PID caps from the identical workload manifest",()=>{
  const plan=makeLinuxIsolationPlan(demoManifest());
  assert.equal(plan.cpuMax,"15000 100000");
  assert.equal(plan.memoryMax,"67108864");
  assert.equal(plan.memorySwapMax,"0");
  assert.equal(plan.pidsMax,"16");
  assert.equal(plan.storageQuotaEnforced,false);
  assert.equal(plan.hardwareValidated,false);
});
