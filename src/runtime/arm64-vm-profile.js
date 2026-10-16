"use strict";
const os=require("node:os"),fs=require("node:fs"),path=require("node:path");
const {performance}=require("node:perf_hooks");
const {openEdgeService}=require("./edge-service.js");
const {runGoldenTraces}=require("./golden-traces.js");
const {createScriptedWanPorts}=require("../adapters/scripted-wan-ports.js");
const profiles=require("../../docs/contracts/arm64-vm-profiles-v1.json").profiles;
function assessGuest({profile,platform=os.platform(),arch=os.arch(),memoryMiB=Math.floor(os.totalmem()/1048576),cpuCount=os.cpus().length}={}){
 const spec=profiles[profile];if(!spec)throw Error("UNKNOWN_ARM64_VM_PROFILE");
 const linuxArm64=platform==="linux"&&arch==="arm64";
 const memoryMatches=memoryMiB>=Math.floor(spec.memoryMiB*0.88)&&memoryMiB<=Math.ceil(spec.memoryMiB*1.06);
 const profileEnforced=linuxArm64&&memoryMatches&&cpuCount>=1&&cpuCount<=spec.cpus;
 return {profile,spec,observed:{platform,arch,memoryMiB,cpuCount},linuxArm64,memoryMatches,profileEnforced,
   hardwareValidated:false,socEmulated:false};
}
async function runArm64VmProfile({profile="r28s-1g",count=50,baseDir,requireArm64=false,enforceGuestLimits=false}={}){
 if(!Number.isSafeInteger(count)||count<1||count>5000)throw Error("INVALID_ARM64_COUNT");
 const guest=assessGuest({profile});
 if(requireArm64&&!guest.linuxArm64)throw Error("ARM64_LINUX_REQUIRED");
 if(enforceGuestLimits&&!guest.profileEnforced)throw Error("ARM64_GUEST_LIMITS_NOT_ENFORCED");
 const dir=fs.mkdtempSync(path.join(baseDir||os.tmpdir(),"pef-arm64-"));
 const ports=createScriptedWanPorts({primary:{link:true,upstream:false},backup:{link:true,upstream:false}});
 const identity={siteId:"arm-lab",deviceId:"r28s-guest",configRevision:"r1"};
 const start=performance.now(),cpuBefore=process.cpuUsage();
 let receiptDurationMs=0;
 let peak=process.memoryUsage().rss,edge=null,accepted=0,recovered=0,journalBytes=0,error=null;
 const interval=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},10);
 try{
   edge=openEdgeService({dir,ports,identity,sessionId:"arm-boot-1",journalOptions:{capacityBytes:16*1024*1024}});
   await edge.sample(1);
   const receiptStart=performance.now();
   for(let i=0;i<count;i++){
     const result=edge.receivePackage({receiptId:"R-"+i,packageId:"P-"+i});
     if(!result.accepted||!result.fsyncCompleted)throw Error("NON_DURABLE_ACK:"+i);
     accepted++;peak=Math.max(peak,process.memoryUsage().rss);
   }
   receiptDurationMs=performance.now()-receiptStart;
   edge.close();edge=null;
   edge=openEdgeService({dir,ports,identity,sessionId:"arm-boot-2",journalOptions:{capacityBytes:8*1024*1024}});
   recovered=edge.listReceipts().length;
   journalBytes=fs.statSync(edge.journalPath).size;
   if(accepted!==recovered)throw Error("REOPEN_LOST_RECEIPTS");
   const duplicate=edge.receivePackage({receiptId:"R-0",packageId:"P-0"});
   if(!duplicate.accepted||!duplicate.duplicate)throw Error("REOPEN_LOST_DEDUP");
 }catch(e){error=String(e.message||e);}
 finally{clearInterval(interval);if(edge)edge.close();fs.rmSync(dir,{recursive:true,force:true});}
 const golden=await runGoldenTraces({tmpParent:baseDir||os.tmpdir()});
 const cpu=process.cpuUsage(cpuBefore);
 const memoryBudgetPass=peak<=profiles[profile].memoryMiB*1048576*0.5;
 const ok=!error&&golden.ok&&memoryBudgetPass;
 return {kind:"PEF_ARM64_VM_LAB_REPORT_V1",ok,
   status:!ok?"LAB_FAIL":guest.profileEnforced?"VM_LAB_PASS_CONSTRAINED":"LAB_PASS_PROFILE_NOT_ENFORCED",
   guest,golden:{ok:golden.ok,scenarioCount:4,baselineSha256:golden.baselineSha256,canonicalSha256:golden.canonicalSha256},
   resource:{accepted,recovered,journalBytes,error,
    cpuUserMs:Math.round(cpu.user/1000),cpuSystemMs:Math.round(cpu.system/1000),
    durationMs:Math.round((performance.now()-start)*100)/100,
    receiptDurationMs:Math.round(receiptDurationMs*100)/100,
    receiptPerSecond:receiptDurationMs>0?Math.round(accepted*1000/receiptDurationMs*100)/100:null,
    sampledProcessPeakRssMiB:Math.round(peak/1048576*100)/100,
    processWithinHalfGuestRam:memoryBudgetPass,
    measurementBoundary:"10ms process RSS; does NOT measure whole-device peak"},
   safety:{deviceBackend:"BACKEND_NOT_IMPLEMENTED",physicalValidated:false,
    powerCutValidated:false,physicalWanValidated:false,hostRoutesChanged:false}};
}
module.exports={assessGuest,runArm64VmProfile};
