"use strict";
// Runs real autonomous pef-edge child through the M3 manager; dashboard is only caller.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createManagedEdge}=require("../../runtime/m3-process-manager.js");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function runM3LifecycleSmoke(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m3-smoke-")),events=[];
 const file=path.join(dir,"config.json"),token=randomBytes(32).toString("hex");
 const cfg={schemaVersion:1,backend:"virtual-lab",
  identity:{siteId:"m3-site",deviceId:"m3-edge",configRevision:"r1"},
  storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:5000,
  workload:{enabled:true,reconcileMs:200},
  journal:{capacityBytes:65536,controlReserveBytes:4096},
  wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
 const manager=createManagedEdge({configFile:file,token,maxRestarts:2,healthIntervalMs:300,
  onEvent:e=>events.push(e)});
 let evidence=null;
 const req=async(route,body)=>{
  const url=manager.status().url;
  const res=await fetch(url+route,{method:body?"POST":"GET",
   headers:{"x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:res.status,...await res.json()};
 };
 try{
  const first=await manager.start();
  const initial=await req("state");
  const receipt=await req("workloads/receipts",{receiptId:"M3-1",packageId:"BOX-M3"});
  if(first.phase!=="RUNNING"||initial.network.connectivity!=="LOCAL_ONLY"||
     receipt.http!==201||receipt.fsyncCompleted!==true)throw Error("M3_OFFLINE_BOOT_FAILED");
  const oldPid=first.pid,oldSession=initial.identity.sessionId;
  manager.crashForLab();
  let after=null;
  for(let i=0;i<120;i++){
   if(manager.status().phase==="RUNNING"&&manager.status().pid!==oldPid){
    try{after=await req("state");if(after.http===200)break;}catch{}
   }
   await wait(40);
  }
  if(!after||after.identity.sessionId===oldSession||
     after.receipts.length!==1||after.receipts[0].receiptId!=="M3-1")
     throw Error("M3_RESTART_RECOVERY_FAILED");
  const duplicate=await req("receipts",{receiptId:"M3-1",packageId:"BOX-M3"});
  if(duplicate.http!==200||duplicate.duplicate!==true)throw Error("M3_REOPEN_DEDUP_FAILED");
  const stopped=await manager.stop();
  if(stopped.phase!=="STOPPED")throw Error("M3_SHUTDOWN_FAILED");
  evidence={ok:true,status:"LAB_PASS",kind:"PEF_M3_LIFECYCLE_SMOKE_V1",
   autonomousNoDashboard:true,localOnly:true,fsyncCompleted:true,receiptRetained:true,
   actualProcessSigkill:true,supervisorRestarted:true,sessionRotated:true,
   boundedRestarts:manager.status().restartCount,duplicateAfterRestart:true,
   stoppedGracefully:true,events:events.map(e=>e.type),
   pidLock:"ADVISORY_PID_ONLY_ON_MAC",kernelLinuxLockVerified:false,
   physicalValidated:false,cloudReal:false};
  return evidence;
 }finally{await manager.stop();fs.rmSync(dir,{recursive:true,force:true});}
}
module.exports={runM3LifecycleSmoke};
