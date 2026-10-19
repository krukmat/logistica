"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {makeLinuxIsolationPlan,assertHostedLinuxIsolationPreflight}=
  require("../src/adapters/linux-workload-isolation.js");
const {demoManifest,propertyManifest,hostManifest}=
  require("../src/runtime/demo-workload.js");
const {createLinuxIsolatedProcessDriver}=
  require("../src/adapters/linux-isolated-process-driver.js");
test("M5.5 common supervisor isolation plans include Property/Host with profile-specific enforced budgets",()=>{
 const receiver=makeLinuxIsolationPlan(demoManifest());
 const property=makeLinuxIsolationPlan(propertyManifest());
 const host=makeLinuxIsolationPlan(hostManifest());
 assert.equal(receiver.cpuMax,"15000 100000");
 assert.equal(property.cpuMax,"15000 100000");
 assert.equal(host.cpuMax,"18000 100000");
 assert.equal(property.memoryMax,String(64*1048576));
 assert.equal(host.memoryMax,String(80*1048576));
 for(const plan of [property,host]){
  assert.equal(plan.storageQuotaEnforced,false);
  assert.equal(plan.networkNamespaceRequired,true);
  assert.equal(plan.dropUid,65534);
 }
 assert.throws(()=>makeLinuxIsolationPlan({...hostManifest(),workload_id:"pef-shell"}),
  /WORKLOAD_BINARY_NOT_ALLOWLISTED/);
});
test("M5.5 Linux isolated process driver is CI-root only and refuses local Mac/sandbox bypass",()=>{
 assert.throws(()=>assertHostedLinuxIsolationPreflight({}),/LAB_BLOCKED/);
 assert.throws(()=>createLinuxIsolatedProcessDriver({
  namespace:"pef-s3-100-100",cgroup:"/sys/fs/cgroup/pef-s3-100-100",
  rootfs:"/tmp/foo",nodeInside:"/usr/bin/node"}),/LAB_BLOCKED/);
});
