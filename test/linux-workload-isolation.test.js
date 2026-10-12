"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {demoManifest}=require("../src/runtime/demo-workload.js");
const {makeLinuxIsolationPlan,assertHostedLinuxIsolationPreflight}=require("../src/adapters/linux-workload-isolation.js");
test("S3 Linux cgroup v2 plan honors same workload manifest CPU/RAM limit, no hardcoded host paths",()=>{
 const m=demoManifest(),p=makeLinuxIsolationPlan(m);
 assert.equal(p.cpuMax,"15000 100000");
 assert.equal(p.memoryMax,String(64*1048576));
 assert.equal(p.networkNamespaceRequired,true);
 assert.equal(p.chrootRequired,true);
 assert.equal(p.storageQuotaEnforced,false);
 assert.equal(p.hardwareValidated,false);
 assert.throws(()=>makeLinuxIsolationPlan({...m,workload_id:"bash-shell"}),/WORKLOAD_BINARY_NOT_ALLOWLISTED/);
 assert.throws(()=>makeLinuxIsolationPlan({...m,resources:{...m.resources,memory_limit_mib:2048}}),/LINUX_LAB_LIMIT_TOO_LARGE/);
});
test("S3 privileged Linux adapter refuses production/local hosts and unsafe CI impersonation",()=>{
 assert.throws(()=>assertHostedLinuxIsolationPreflight({CI:"false"}),/LAB_BLOCKED/);
 assert.throws(()=>assertHostedLinuxIsolationPreflight({CI:"true",GITHUB_ACTIONS:"true",
   RUNNER_ENVIRONMENT:"github-hosted",PEF_S3_ACK:"missing"}),/LAB_BLOCKED/);
});
