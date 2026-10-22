"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const {runM81GuestPreflight}=require("../src/runtime/m81-guest-preflight.js");
const {checkGuestReport}=require("../src/core/m81-guest-contract.js");
const sample=()=>({kind:"PEF_M81_GUEST_OBSERVATION_V1",profile:"r28s-1g",
 readOnly:true,guestServicesModified:false,hostRoutesModified:false,
 observed:{platform:"linux",arch:"arm64",memoryMiB:972,cpuCount:4,
  nodeMajor:22,pid1:"systemd",cgroupV2:true,
  controllers:["cpu","memory","pids"],vmDetected:true}});
test("M8.1.A static contract reuses real Linux quota plans and never certifies VM",()=>{
 const report=runM81GuestPreflight();
 assert.equal(report.status,"BLOCKED");
 assert.equal(report.ok,false);
 assert.equal(report.contractStatus,"STATIC_CONTRACT_PASS",JSON.stringify(report));
 assert.equal(report.guestObservationStatus,"NOT_RUN");
 assert.equal(report.readyForM81B,false);
 assert.equal(report.staticChecks.PROPERTY_QUOTA_PLAN,true);
 assert.equal(report.staticChecks.HOST_QUOTA_PLAN,true);
 assert.equal(report.staticChecks.SYSTEMD_UNIT_RENDERABLE,true);
 assert.equal(report.staticChecks.GUARDED_GUEST_ISOLATION_DRIVER_AVAILABLE,false);
 assert.ok(report.blockers.includes("LINUX_DRIVER_HOSTED_CI_ONLY_VM_PORT_NOT_IMPLEMENTED"));
 assert.ok(report.blockers.includes("SINGLE_GUEST_SYSTEMD_CGROUP_CLOUD_MTLS_E2E_NOT_RUN"));
 assert.equal(report.guestModified,false);
 assert.equal(report.hostModified,false);
 assert.equal(report.physicalValidated,false);
});
test("M8.1.A imported plausible guest data remains untrusted and cannot make B ready",()=>{
 const report=runM81GuestPreflight({guestReport:sample()});
 assert.equal(report.guestObservationStatus,"OPERATOR_REPORTED_UNATTESTED");
 assert.equal(report.evidenceOrigin,"UNATTESTED_OPERATOR_REPORT");
 assert.ok(Object.values(report.guestChecks).every(x=>x===true),JSON.stringify(report));
 assert.equal(report.status,"BLOCKED");
 assert.equal(report.guestRuntimeValidated,false);
 assert.equal(report.readyForM81B,false);
 assert.equal(report.kernelLimitsEnforcedValidated,false);
 assert.equal(report.cloudLiteGuestValidated,false);
});
test("M8.1.A rejects forged scope/values and observes mismatch without green status",()=>{
 for(const report of [
  {...sample(),profile:"r28s-768m"},
  {...sample(),readOnly:false},
  {...sample(),guestServicesModified:true},
  {...sample(),observed:{...sample().observed,controllers:["cpu",17]}},
  {...sample(),observed:{...sample().observed,memoryMiB:Infinity}},
  {...sample(),observed:{...sample().observed,platform:"darwin"}}
 ]){
  assert.equal(checkGuestReport(report).accepted,false,JSON.stringify(report));
  assert.equal(runM81GuestPreflight({guestReport:report}).guestObservationStatus,"REJECTED");
 }
 const notEnough=sample();notEnough.observed.memoryMiB=4096;
 const checked=runM81GuestPreflight({guestReport:notEnough});
 assert.equal(checked.guestChecks.GUEST_MEMORY_1G,false);
 assert.equal(checked.readyForM81B,false);
 assert.equal(checked.status,"BLOCKED");
});
test("M8.1.A CLI never probes a non-Linux host or guest without opt-in",()=>{
 const binary=path.join(root,"bin/pef-m81-preflight.js");
 const contract=spawnSync(process.execPath,[binary,"--contract"],
  {encoding:"utf8",timeout:4000});
 assert.equal(contract.status,0,contract.stderr);
 assert.equal(JSON.parse(contract.stdout).guestObservationStatus,"NOT_RUN");
 const denied=spawnSync(process.execPath,[binary,"--guest-readonly"],
  {encoding:"utf8",timeout:4000,env:{...process.env,PEF_M81_OBSERVE_ACK:"INVALID"}});
 assert.equal(denied.status,1,denied.stdout);
 assert.match(denied.stderr,/M81_GUEST_READONLY_BLOCKED/);
 const shell=spawnSync("bash",["-n",path.join(root,"scripts/arm64-vm/m81-lima-observe.sh")],
  {encoding:"utf8",timeout:4000});
 assert.equal(shell.status,0,shell.stderr);
 const noAck=spawnSync("bash",[path.join(root,"scripts/arm64-vm/m81-lima-observe.sh"),"r28s-1g"],
  {encoding:"utf8",timeout:4000,env:{...process.env,PEF_M81_VM_ACK:""}});
 assert.equal(noAck.status,78,noAck.stderr);
 assert.match(noAck.stderr,/explicit VM-only read permission/);
});
test("M8.1.A offline CLI imports bounded guest reports but rejects oversized/invalid",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m81-test-"));
 try{
  const file=path.join(dir,"guest.json"),binary=path.join(root,"bin/pef-m81-preflight.js");
  fs.writeFileSync(file,JSON.stringify(sample()));
  const imported=spawnSync(process.execPath,[binary,"--report",file],
   {encoding:"utf8",timeout:4000});
  assert.equal(imported.status,0,imported.stderr);
  assert.equal(JSON.parse(imported.stdout).status,"BLOCKED");
  fs.writeFileSync(file,JSON.stringify({...sample(),readOnly:false}));
  const rejected=spawnSync(process.execPath,[binary,"--report",file],
   {encoding:"utf8",timeout:4000});
  assert.equal(rejected.status,1);
  assert.equal(JSON.parse(rejected.stdout).guestObservationStatus,"REJECTED");
  fs.writeFileSync(file,"x".repeat(20001));
  const oversized=spawnSync(process.execPath,[binary,"--report",file],
   {encoding:"utf8",timeout:4000});
  assert.equal(oversized.status,1);
  assert.match(oversized.stderr,/M81_REPORT_FILE_SIZE_INVALID/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
