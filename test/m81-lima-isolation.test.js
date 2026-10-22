"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const path=require("node:path"),{spawnSync}=require("node:child_process");
const {assessM81LimaScope,assertM81LimaIsolationPreflight}=
 require("../src/adapters/m81-lima-isolation-scope.js");
const {createLinuxIsolatedProcessDriver}=
 require("../src/adapters/linux-isolated-process-driver.js");
const {runM81B1IsolationContract}=
 require("../src/runtime/m81-b1-isolation-contract.js");
const env=()=>({PEF_M81_ISOLATION_ACK:"EXPLICIT_M81_LIMA_ISOLATED_WORKER",
 PEF_M81_VM_ID:"pef-r28s-1g",PEF_M81_ISOLATION_SCOPE:"M81_LIMA_VM"});
const guest=()=>({env:env(),platform:"linux",arch:"arm64",uid:0,
 hostname:"lima-pef-r28s-1g",vmDetected:true,pid1:"systemd",
 memoryMiB:972,cpuCount:4,cgroupV2:true,
 controllers:["cpu","memory","pids","io"],nodeMajor:22});
test("M8.1.B1 separate Lima authorization is pure and explicitly scoped",()=>{
 const pass=assessM81LimaScope(guest());
 assert.equal(pass.ok,true,JSON.stringify(pass));
 assert.equal(pass.status,"AUTHORIZED_GUEST_LAB_ONLY");
 assert.equal(pass.hostVerifiedByHardwareAttestation,false);
 assert.equal(pass.guestOperationsPerformed,false);
 assert.equal(pass.productionAuthorized,false);
 assert.ok(Object.values(pass.checks).every(Boolean));
});
test("M8.1.B1 denies spoofed GitHub CI, wrong VM, missing ack and non-root",()=>{
 const cases=[
  g=>{g.env={...g.env,PEF_M81_ISOLATION_ACK:""};},
  g=>{g.env={...g.env,PEF_M81_VM_ID:"pef-other"};},
  g=>{g.env={...g.env,PEF_M81_ISOLATION_SCOPE:"GITHUB_HOSTED_CI"};},
  g=>{g.env={...g.env,GITHUB_ACTIONS:"true"};},
  g=>{g.env={...g.env,RUNNER_ENVIRONMENT:"github-hosted"};},
  g=>{g.uid=501;},
  g=>{g.hostname="random-vm";},
  g=>{g.vmDetected=false;},
  g=>{g.pid1="bash";},
  g=>{g.platform="darwin";},
  g=>{g.arch="x64";},
  g=>{g.memoryMiB=2048;},
  g=>{g.cpuCount=8;},
  g=>{g.cgroupV2=false;},
  g=>{g.controllers=["cpu","memory"];},
  g=>{g.nodeMajor=18;}
 ];
 for(const update of cases){
  const x=guest();update(x);
  const result=assessM81LimaScope(x);
  assert.equal(result.status,"BLOCKED",JSON.stringify(x));
  assert.equal(result.ok,false);
  assert.ok(result.failed.length);
 }
});
test("M8.1.B1 current host cannot use guest scope by merely setting ack",()=>{
 const original=process.env.PEF_M81_ISOLATION_ACK;
 const forged={...process.env,...env()};
 // The adapter's runtime assertion reads actual OS, root, virt and kernel facts.
 // Never call a privileged action, even in a CI root environment.
 if(process.platform!=="linux"||process.arch!=="arm64"||process.geteuid?.()!==0){
  assert.throws(()=>assertM81LimaIsolationPreflight(forged),/M81_LIMA_ISOLATION_BLOCKED/);
  assert.throws(()=>createLinuxIsolatedProcessDriver({runtimeScope:"M81_LIMA_VM",
   namespace:"pef-m81-10-11",cgroup:"/sys/fs/cgroup/pef-m81-10-11",
   rootfs:"/tmp/pef-m81-10-11/root",nodeInside:"/usr/bin/node",
   hostCanary:"/tmp/pef-m81-10-11/host-canary"}),/M81_LIMA_ISOLATION_BLOCKED/);
 }
 assert.throws(()=>createLinuxIsolatedProcessDriver({runtimeScope:"allow-any"}),
  /LAB_BLOCKED:unknown-driver-scope/);
 assert.equal(process.env.PEF_M81_ISOLATION_ACK,original);
});
test("M8.1.B1 contract is always code-ready guest-NOT-RUN, not physical validation",()=>{
 const r=runM81B1IsolationContract();
 assert.equal(r.kind,"PEF_M81_B1_ISOLATION_CONTRACT_V1");
 assert.equal(r.staticContractOk,true);
 assert.equal(r.status,"CODE_READY_GUEST_NOT_RUN");
 assert.equal(r.ok,false);
 assert.equal(r.actualGuestIsolationValidated,false);
 assert.equal(r.readyForM81B2,false);
 assert.equal(r.checks.PROPERTY_QUOTAS_PINNED,true);
 assert.equal(r.checks.HOST_QUOTAS_PINNED,true);
 assert.equal(r.checks.UNSANDBOXED_FALLBACK_ALLOWED,false);
 assert.equal(r.checks.GUEST_KERNEL_ENFORCEMENT_OBSERVED,false);
 assert.equal(r.policyProbe.rootDenied,true);
});
test("M8.1.B1 read-only CLI inspect works and guest-check refuses no ACK",()=>{
 const binary=path.resolve(__dirname,"../bin/pef-m81-isolation.js");
 const inspected=spawnSync(process.execPath,[binary,"--contract"],
  {encoding:"utf8",timeout:5000});
 assert.equal(inspected.status,0,inspected.stderr);
 assert.equal(JSON.parse(inspected.stdout).readyForM81B2,false);
 const denied=spawnSync(process.execPath,[binary,"--guest-check"],
  {encoding:"utf8",timeout:5000,
   env:{...process.env,PEF_M81_ISOLATION_ACK:"INVALID",
    PEF_M81_VM_ID:"pef-r28s-1g",PEF_M81_ISOLATION_SCOPE:"M81_LIMA_VM"}});
 assert.equal(denied.status,78,denied.stderr);
 assert.match(denied.stderr,/M81_LIMA_ISOLATION_BLOCKED/);
});
