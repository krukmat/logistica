"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {createM81B2Plan,inspectM81B2Evidence,REQUIRED,EVIDENCE_KIND}=
 require("../src/runtime/m81-b2-plan.js");
const root=path.resolve(__dirname,"..");
const valid=()=>({kind:EVIDENCE_KIND,task:"M8.1.B2",profile:"pef-r28s-1g",
 status:"LAB_PASS",ok:true,checks:Object.fromEntries(REQUIRED.map(k=>[k,true])),
 workloads:{
  property:{workloadId:"pef-property",
   isolation:"LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM",actualLimitsEnforced:true,
   pid:120, memoryPeakBytes:38000000},
  host:{workloadId:"pef-host",
   isolation:"LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM",actualLimitsEnforced:true,
   pid:121,memoryPeakBytes:39000000}
 },cleanup:{status:"PASS",ownedResourcesRemoved:true},
 physicalValidated:false,productionAuthorized:false,vmRebootValidated:false,
 systemdManagedValidated:false});
test("M8.1.B2 plan uses real Property/Host manifests and remains guest-not-run",()=>{
 const p=createM81B2Plan();
 assert.equal(p.status,"GUEST_NOT_RUN");
 assert.equal(p.ok,false);assert.equal(p.readyForM81C,false);
 assert.equal(p.profiles.property.memoryMax,"67108864");
 assert.equal(p.profiles.property.cpuMax,"15000 100000");
 assert.equal(p.profiles.host.memoryMax,"83886080");
 assert.equal(p.profiles.host.cpuMax,"18000 100000");
 assert.equal(p.profiles.host.swapMax,"0");
 assert.equal(p.profiles.property.pidsMax,"16");
 assert.equal(p.systemdManagedValidated,false);
 assert.equal(p.privilegedGuestOptInRequired,true);
});
test("M8.1.B2 operator guest report is untrusted even if every check is green",()=>{
 const r=inspectM81B2Evidence(valid());
 assert.equal(r.accepted,true);
 assert.equal(r.status,"OPERATOR_REPORTED_UNATTESTED");
 assert.equal(r.guestKernelEvidenceIndependentlyVerified,false);
 assert.equal(r.readyForM81C,false);
 assert.equal(r.physicalValidated,false);
 assert.equal(r.systemdManagedValidated,false);
});
test("M8.1.B2 missing kernel quota, failed cleanup and forged field claims reject",()=>{
 const cases=[
  x=>{x.checks.MANIFEST_CGROUP_LIMITS=false;},
  x=>{delete x.checks.WORKER_UID_AND_NETNS;},
  x=>{x.cleanup.ownedResourcesRemoved=false;},
  x=>{x.workloads.property.actualLimitsEnforced=false;},
  x=>{x.workloads.property.memoryPeakBytes=1000000000;},
  x=>{x.workloads.host.isolation="PROCESS_ONLY";},
  x=>{x.workloads.property.pid=0;},
  x=>{x.systemdManagedValidated=true;},
  x=>{x.physicalValidated=true;},
  x=>{x.status="CODE_READY";},
  x=>{x.profile="r28s-768m";}
 ];
 for(const mutate of cases){
  const x=valid();mutate(x);
  const r=inspectM81B2Evidence(x);
  assert.equal(r.accepted,false,JSON.stringify(x));
  assert.equal(r.readyForM81C,false);
 }
});
test("M8.1.B2 CLI is strictly inspection-only by default, --run needs ACK",()=>{
 const bin=path.join(root,"bin/pef-m81-b2.js");
 const planned=spawnSync(process.execPath,[bin,"--plan"],
  {encoding:"utf8",timeout:5000});
 assert.equal(planned.status,0,planned.stderr);
 assert.equal(JSON.parse(planned.stdout).status,"GUEST_NOT_RUN");
 const denied=spawnSync(process.execPath,[bin,"--run","/tmp/test","pef-m81-1-1","pef-m81-1-2"],
  {encoding:"utf8",timeout:5000,
   env:{...process.env,PEF_M81_B2_ACK:"NO"}});
 assert.equal(denied.status,78,denied.stderr);
 assert.match(denied.stderr,/M81_B2_OPERATOR_ACK_REQUIRED/);
});
test("M8.1.B2 bounded JSON inspection accepts no execution capabilities",()=>{
 const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m81-b2-test-"));
 const file=path.join(sandbox,"guest.json");
 const bin=path.join(root,"bin/pef-m81-b2.js");
 try{
  fs.writeFileSync(file,JSON.stringify(valid()));
  const r=spawnSync(process.execPath,[bin,"--inspect",file],{encoding:"utf8",timeout:4000});
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).provenance,"OPERATOR_JSON_UNATTESTED");
  fs.writeFileSync(file,"?".repeat(32769));
  const oversized=spawnSync(process.execPath,[bin,"--inspect",file],{encoding:"utf8",timeout:4000});
  assert.equal(oversized.status,78);
  assert.match(oversized.stderr,/M81_B2_REPORT_FILE_INVALID/);
 }finally{fs.rmSync(sandbox,{recursive:true,force:true});}
});
test("M8.1.B2 guest shell parses and never executes without operator ACK",()=>{
 const shell=path.join(root,"scripts/arm64-vm/m81-b2-guest.sh");
 const syntax=spawnSync("bash",["-n",shell],{encoding:"utf8",timeout:4000});
 assert.equal(syntax.status,0,syntax.stderr);
 const denied=spawnSync("bash",[shell,"--run"],{encoding:"utf8",timeout:4000,
  env:{...process.env,PEF_M81_B2_ACK:""}});
 assert.equal(denied.status,78,denied.stderr);
 assert.match(denied.stderr,/operator opt-in absent/);
 // --plan never attempts root, namespaces or any VM call.
 const plan=spawnSync("bash",[shell,"--plan"],{encoding:"utf8",timeout:4000});
 assert.equal(plan.status,0,plan.stderr);
 assert.equal(JSON.parse(plan.stdout).guestModificationPerformed,false);
});
