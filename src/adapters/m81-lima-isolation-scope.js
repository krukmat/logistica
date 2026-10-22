"use strict";
// M8.1.B1 — distinct Lima VM root authorization. No CI spoofing or host execution.
// This gate intentionally never launches guests or makes privilege changes.
const fs=require("node:fs"),os=require("node:os"),{spawnSync}=require("node:child_process");
const REQUIRED=["cpu","memory","pids"];
const VM_NAME="pef-r28s-1g",ACK="EXPLICIT_M81_LIMA_ISOLATED_WORKER";
function assessM81LimaScope(facts){
 const x=facts||{},env=x.env||{};
 const checks={
  GUEST_LINUX_ARM64:x.platform==="linux"&&x.arch==="arm64",
  ROOT_IN_GUEST:x.uid===0,
  EXPLICIT_LIMA_ACK:env.PEF_M81_ISOLATION_ACK===ACK,
  EXACT_GUEST_NAME:env.PEF_M81_VM_ID===VM_NAME,
  NOT_GITHUB_ACTIONS:env.GITHUB_ACTIONS!=="true"&&
   env.RUNNER_ENVIRONMENT!=="github-hosted",
  VM_IDENTITY:x.vmDetected===true&&
   ["pef-r28s-1g","lima-pef-r28s-1g"].includes(x.hostname),
  SYSTEMD_PID1:x.pid1==="systemd",
  GUEST_MEMORY_1GB:Number.isSafeInteger(x.memoryMiB)&&
   x.memoryMiB>=901&&x.memoryMiB<=1086,
  CPU_MAX4:Number.isSafeInteger(x.cpuCount)&&x.cpuCount>=1&&x.cpuCount<=4,
  CGROUP_V2_READABLE:x.cgroupV2===true&&Array.isArray(x.controllers)&&
   REQUIRED.every(c=>x.controllers.includes(c)),
  NODE20_PLUS:Number.isSafeInteger(x.nodeMajor)&&x.nodeMajor>=20,
  ISOLATION_SCOPE_OPT_IN:env.PEF_M81_ISOLATION_SCOPE==="M81_LIMA_VM"
 };
 const failed=Object.keys(checks).filter(k=>checks[k]!==true);
 return {kind:"PEF_M81_LIMA_ISOLATION_AUTH_V1",
  status:failed.length?"BLOCKED":"AUTHORIZED_GUEST_LAB_ONLY",
  ok:failed.length===0,checks,failed,
  guestScope:"M81_LIMA_VM",ciImpersonationAllowed:false,
  guestOperationsPerformed:false,hardwareValidated:false,
  productionAuthorized:false,hostVerifiedByHardwareAttestation:false};
}
function readM81LimaGuestFacts(env=process.env){
 const read=p=>{try{return fs.readFileSync(p,"utf8").trim();}catch{return "";}};
 const v=spawnSync("systemd-detect-virt",["--vm"],{
  encoding:"utf8",timeout:2000,stdio:["ignore","pipe","ignore"]});
 const controllers=read("/sys/fs/cgroup/cgroup.controllers").split(/\s+/).filter(Boolean);
 const match=read("/proc/meminfo").match(/^MemTotal:\s*(\d+) kB/m);
 return {platform:process.platform,arch:process.arch,
  uid:process.geteuid?.(),hostname:os.hostname(),vmDetected:v.status===0,
  pid1:read("/proc/1/comm"),
  memoryMiB:match?Math.floor(Number(match[1])/1024):null,
  cpuCount:os.cpus().length,
  cgroupV2:fs.existsSync("/sys/fs/cgroup/cgroup.controllers"),
  controllers,nodeMajor:Number(process.versions.node.split(".")[0]),env};
}
function assertM81LimaIsolationPreflight(env=process.env){
 // Never accept a caller-supplied guest report as authorization.
 const evaluated=assessM81LimaScope(readM81LimaGuestFacts(env));
 if(!evaluated.ok)
  throw Error("M81_LIMA_ISOLATION_BLOCKED:"+evaluated.failed.join(","));
 return evaluated;
}
module.exports={assessM81LimaScope,readM81LimaGuestFacts,
 assertM81LimaIsolationPreflight,VM_NAME};
