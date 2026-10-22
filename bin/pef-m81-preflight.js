#!/usr/bin/env node
"use strict";
// M8.1.A: never start or provision a guest. Read-only guest capture requires ACK.
const fs=require("node:fs"),os=require("node:os"),{spawnSync}=require("node:child_process");
const {runM81GuestPreflight}=require("../src/runtime/m81-guest-preflight.js");
function main(){
 const args=process.argv.slice(2);
 if(args.length===0||args.length===1&&args[0]==="--contract"){
  console.log(JSON.stringify(runM81GuestPreflight(),null,2));return;
 }
 if(args.length===1&&args[0]==="--guest-readonly"){
  if(process.env.PEF_M81_OBSERVE_ACK!=="EXPLICIT_READ_ONLY_LIMA_M81"||
     process.platform!=="linux"||process.arch!=="arm64")
    throw Error("M81_GUEST_READONLY_BLOCKED: explicit acknowledgement and Linux ARM64 required");
  const read=(p)=>{try{return fs.readFileSync(p,"utf8").trim();}catch{return "";}};
  const memory=read("/proc/meminfo").match(/^MemTotal:\s*(\d+) kB/m);
  const controllers=read("/sys/fs/cgroup/cgroup.controllers").split(/\s+/).filter(Boolean);
  const virt=spawnSync("systemd-detect-virt",["--vm"],{
   encoding:"utf8",timeout:2000,stdio:["ignore","pipe","ignore"]});
  const report={kind:"PEF_M81_GUEST_OBSERVATION_V1",profile:"r28s-1g",
   readOnly:true,guestServicesModified:false,hostRoutesModified:false,
   observed:{platform:process.platform,arch:process.arch,
    memoryMiB:memory?Math.floor(Number(memory[1])/1024):0,
    cpuCount:os.cpus().length,
    nodeMajor:Number(process.versions.node.split(".")[0]),
    pid1:read("/proc/1/comm"),cgroupV2:controllers.length>0,
    controllers,vmDetected:virt.status===0}};
  console.log(JSON.stringify(report,null,2));return;
 }
 if(args.length===2&&args[0]==="--report"){
  const stat=fs.statSync(args[1]);
  if(!stat.isFile()||stat.size<2||stat.size>20000)throw Error("M81_REPORT_FILE_SIZE_INVALID");
  let report;
  try{report=JSON.parse(fs.readFileSync(args[1],"utf8"));}
  catch{throw Error("M81_REPORT_NOT_VALID_JSON");}
  const result=runM81GuestPreflight({guestReport:report});
  console.log(JSON.stringify(result,null,2));
  if(result.guestObservationStatus==="REJECTED")process.exitCode=1;
  return;
 }
 throw Error("M81_USAGE: npm run m8:preflight -- [--contract|--report /path/guest.json|--guest-readonly]");
}
try{main();}catch(e){console.error("M81_PREFLIGHT_BLOCKED:"+String(e.message||e));process.exitCode=1;}
