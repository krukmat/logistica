"use strict";
// W1.10.E1: read-only Linux /proc and cgroup v2 snapshots; NO hardware qualification.
// Child workload is an explicitly unisolated probe to exercise aggregate memory pressure.
const fs=require("node:fs"),os=require("node:os");
const {spawn}=require("node:child_process");
const profiles=require("../../docs/contracts/arm64-vm-profiles-v1.json").profiles;
const read=(p)=>{try{return fs.readFileSync(p,"utf8");}catch{return null;}};
const mib=n=>Number.isFinite(n)?Math.round(n/1048576*100)/100:null;
const int=s=>{const n=Number(s);return Number.isFinite(n)?n:null;};
function kv(s,unit=1){
 const out={};if(!s)return out;
 for(const line of s.split("\n")){const m=line.match(/^([A-Za-z_()]+):?\s+(\d+)/);if(m)out[m[1]]=Number(m[2])*unit;}
 return out;
}
function cgroup(){
 const own=read("/proc/self/cgroup");
 if(!own)return {available:false,reason:"PROC_CGROUP_UNAVAILABLE"};
 const unified=own.split("\n").find(l=>l.startsWith("0::"));
 if(!unified)return {available:false,reason:"CGROUP_V2_NOT_AVAILABLE"};
 const rel=unified.slice(3),base="/sys/fs/cgroup"+rel;
 return {available:true,memoryCurrentMiB:mib(int((read(base+"/memory.current")||"").trim())),
  memoryMaxBytes:(read(base+"/memory.max")||"").trim()||null,
  memoryPeakMiB:mib(int((read(base+"/memory.peak")||"").trim())),
  swapCurrentMiB:mib(int((read(base+"/memory.swap.current")||"").trim())),
  events:kv(read(base+"/memory.events")),pressure:read(base+"/memory.pressure")?.trim()||null,
  // Read-only inventory: presence != actual workload isolation.
  kernelMemoryLimitVerified:false};
}
function snapshot(){
 const m=kv(read("/proc/meminfo"),1024);
 return {timestamp:new Date().toISOString(),
  processRssMiB:mib(process.memoryUsage().rss),
  guestMemTotalMiB:mib(m.MemTotal),guestMemAvailableMiB:mib(m.MemAvailable),
  swapTotalMiB:mib(m.SwapTotal),swapFreeMiB:mib(m.SwapFree),
  memoryPressure:read("/proc/pressure/memory")?.trim()||null,
  vmstat:kv(read("/proc/vmstat")),cgroup:cgroup(),
  linuxArm64:process.platform==="linux"&&process.arch==="arm64"};
}
async function runResourceEnvelope({profile="r28s-1g",requireConstrained=false,probeMiB=32}={}){
 if(!profiles[profile])throw Error("E1_UNKNOWN_PROFILE");
 if(!Number.isSafeInteger(probeMiB)||probeMiB<4||probeMiB>64)throw Error("E1_PROBE_OUT_OF_BOUNDS");
 const {assessGuest}=require("./arm64-vm-profile.js"),guest=assessGuest({profile});
 if(requireConstrained&&!guest.profileEnforced)throw Error("E1_GUEST_LIMITS_NOT_ENFORCED");
 const before=snapshot();
 const childSource='const b=Buffer.alloc('+probeMiB+'*1048576,1);setInterval(()=>{if(!b.length)process.exit(1)},100);';
 const child=spawn(process.execPath,["-e",childSource],{stdio:"ignore",env:{PATH:process.env.PATH||""}});
 let peakUsed=0,minAvailable=Infinity;
 const sample=()=>{const s=snapshot();if(s.guestMemTotalMiB!==null&&s.guestMemAvailableMiB!==null){
  peakUsed=Math.max(peakUsed,s.guestMemTotalMiB-s.guestMemAvailableMiB);
  minAvailable=Math.min(minAvailable,s.guestMemAvailableMiB);
 }return s;};
 let during=null;
 try{
  const started=Date.now();
  while(Date.now()-started<950){await new Promise(r=>setTimeout(r,50));during=sample();}
 }finally{
  child.kill("SIGKILL");
  await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once("close",resolve);});
 }
 const after=sample();
 const beforeOom=before.cgroup.events?.oom_kill??null,afterOom=after.cgroup.events?.oom_kill??null;
 const noObservedOom=beforeOom===null||afterOom===null?null:afterOom===beforeOom;
 const guestSlack=Number.isFinite(minAvailable)?minAvailable:null;
 const provisionalBudgetOk=guestSlack===null?false:guestSlack>=Math.max(64,profiles[profile].memoryMiB*0.1);
 const ok=(noObservedOom!==false)&&provisionalBudgetOk&&(!requireConstrained||guest.profileEnforced);
 return {kind:"PEF_E1_GUEST_RESOURCE_ENVELOPE_V1",ok,
  status:!ok?"GUEST_RESOURCE_GUARD_BLOCKED":guest.profileEnforced?"GUEST_RESOURCE_PROBE_PASS":"UNCONSTRAINED_ISA_OBSERVATION",
  profile,guest,before,during,after,probe:{allocatedChildMiB:probeMiB,
    isolatedByCgroups:false,oomDeltaKnown:noObservedOom!==null,anyOomKilled:noObservedOom===false,
    minAvailableMiB:guestSlack,peakEstimatedGuestUsedMiB:peakUsed,provisionalMemoryHeadroomOk:provisionalBudgetOk},
  limitations:{full72hLoadMeasured:false,fullWorkloadIsolationNotEnforced:true,thermalPowerNotMeasured:true,
    physicalValidated:false,procurementApproved:false}};
}
module.exports={snapshot,runResourceEnvelope};
