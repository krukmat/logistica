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

test("M8.1.B2 Mac runner refuses mutation without its separate opt-in",()=>{
 const wrapper=path.join(root,"scripts/arm64-vm/m81-b2-lima.sh");
 const syntax=spawnSync("bash",["-n",wrapper],{encoding:"utf8",timeout:4000});
 assert.equal(syntax.status,0,syntax.stderr);
 const denied=spawnSync("bash",[wrapper,"--run"],{encoding:"utf8",timeout:4000,
  env:{...process.env,PEF_M81_B2_MAC_ACK:""}});
 assert.equal(denied.status,78,denied.stderr);
 assert.match(denied.stderr,/separate Mac operator authorization absent/);
});

test("M8.1.B2 read-only guest readiness is fail-closed on the current non-VM host",()=>{
 const tool=path.join(root,"bin/pef-m81-b2-guest-check.js");
 const p=spawnSync(process.execPath,[tool],{encoding:"utf8",timeout:6000,
  env:{...process.env,PEF_M81_ISOLATION_ACK:"EXPLICIT_M81_LIMA_ISOLATED_WORKER",
   PEF_M81_ISOLATION_SCOPE:"M81_LIMA_VM",PEF_M81_VM_ID:"pef-r28s-1g"}});
 assert.equal(p.status,78,p.stderr);
 const result=JSON.parse(p.stdout);
 assert.equal(result.readOnly,true);
 assert.equal(result.guestSandboxStarted,false);
 assert.equal(result.operatorRunApproved,false);
 assert.equal(result.checks.GUEST_B1_SCOPE,false);
 assert.ok(result.failed.includes("GUEST_B1_SCOPE"));
});
test("M8.1.B2 Lima --check requires read-only opt-in, not mutation approval",()=>{
 const tool=path.join(root,"scripts/arm64-vm/m81-b2-lima.sh");
 const r=spawnSync("bash",[tool,"--check"],{encoding:"utf8",timeout:4000,
  env:{...process.env,PEF_M81_VM_ACK:"",PEF_M81_B2_MAC_ACK:""}});
 assert.equal(r.status,78,r.stderr);
 assert.match(r.stderr,/read-only VM operator authorization absent/);
});

test("M8.1.B2 runtime exposes actual isolated worker PID, never invents one",async()=>{
 const {createWorkloadSupervisor}=require("../src/core/workload-supervisor.js");
 const {createWorkloadManager}=require("../src/core/workload-manager.js");
 const {propertyManifest}=require("../src/runtime/demo-workload.js");
 const fake={start:async()=>({
  pid:15432,isolation:"LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM",
  actualLimitsEnforced:true,kernelLimits:{pidsMax:"16"},
  async health(){return {ok:true};},async stop(){return {ok:true};}
 })};
 const manager=createWorkloadManager();
 const sup=createWorkloadSupervisor({manager,driver:fake});
 try{
  const status=await sup.start(propertyManifest(),{trusted:true,offline:true});
  assert.equal(status.ok,true);
  assert.equal(status.pid,15432);
  assert.equal(sup.list()[0].pid,15432);
 }finally{await sup.close();}
});
test("M8.1.B2 SIGABRT diagnosis distinguishes PID and memory pressure without revealing secrets",()=>{
 const {m81KernelExitDiagnostic,M81_NODE_FLAGS}=
  require("../src/adapters/linux-isolated-process-driver.js");
 const read=(file)=>{
  if(file.endsWith("/pids.events"))return "max 2\n";
  if(file.endsWith("/memory.events"))return "low 0\nmax 0\noom 0\noom_kill 0\n";
  if(file.endsWith("/memory.peak"))return "42000000\n";
  throw Error("unexpected file");
 };
 const report=m81KernelExitDiagnostic({signal:"SIGABRT",code:null,
  cgroup:"/sys/fs/cgroup/pef-m81-100-2",
  stderr:"uv_thread_create failed\n",read});
 assert.match(report,/EXIT_SIGABRT/);
 assert.match(report,/pidsMaxHits=2/);
 assert.match(report,/memoryOomKill=0/);
 assert.match(report,/stderr=uv_thread_create failed/);
 assert.deepEqual(M81_NODE_FLAGS,["--v8-pool-size=1"]);
});
