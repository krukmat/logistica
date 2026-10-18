"use strict";
// W1.10.F1: staged, bounded index-scaling on OS journal. NO 72h/physical certification.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process");
const {performance}=require("node:perf_hooks");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {assessGuest}=require("./arm64-vm-profile.js");
const {snapshot}=require("./arm64-resource-envelope.js");
const ONE_MIB=1048576,MAX_JOURNAL_MIB=256,MIN_FREE_MIB=512,MIN_GUEST_AVAILABLE_MIB=128,MAX_RSS_MIB=512,MAX_WALL_MS=20*60*1000;
function percentile(v,p){if(!v.length)return null;const a=[...v].sort((x,y)=>x-y);return Math.round(a[Math.ceil(a.length*p/100)-1]*1000)/1000;}
function freeMiB(root){const s=fs.statfsSync(root);return s.bavail*s.bsize/ONE_MIB;}
function guard({root,journal,started,baseline,reading}){
 if(performance.now()-started>MAX_WALL_MS)throw Error("F1_TIME_LIMIT");
 if(freeMiB(root)<MIN_FREE_MIB)throw Error("F1_DISK_HEADROOM");
 if(journal&&journal.status().bytesUsed>(MAX_JOURNAL_MIB-1)*ONE_MIB)throw Error("F1_JOURNAL_SIZE_LIMIT");
 const sample=reading||snapshot();
 if(sample.processRssMiB>MAX_RSS_MIB)throw Error("F1_PROCESS_RSS_LIMIT");
 if(sample.guestMemAvailableMiB!==null&&sample.guestMemAvailableMiB<MIN_GUEST_AVAILABLE_MIB)
   throw Error("F1_GUEST_RAM_HEADROOM");
 const startOom=baseline.cgroup?.events?.oom_kill,latestOom=sample.cgroup?.events?.oom_kill;
 if(Number.isFinite(startOom)&&Number.isFinite(latestOom)&&latestOom>startOom)
   throw Error("F1_OOM_KILL_OBSERVED");
 return sample;
}
async function runJournalScale({profile="r28s-1g",mode="smoke",baseDir,requireConstrained=false,ack,stageCallback=()=>{}}={}){
 if(!["smoke","full"].includes(mode))throw Error("F1_UNKNOWN_MODE");
 const guest=assessGuest({profile});
 const linuxVirtualMachine=mode!=="full"||spawnSync("systemd-detect-virt",["--vm"],{timeout:2000,encoding:"utf8"}).status===0;
 if(mode==="full"&&(!requireConstrained||ack!=="R28S_1GB_STAGED_TEST"||!guest.profileEnforced||!linuxVirtualMachine))
   throw Error("F1_FULL_REQUIRES_CONSTRAINED_VM_AND_EXPLICIT_ACK");
 if(requireConstrained&&!guest.profileEnforced)throw Error("F1_NOT_CONSTRAINED_ARM64");
 const root=baseDir||os.tmpdir();
 if(!fs.statSync(root).isDirectory())throw Error("F1_INVALID_BASEDIR");
 if(freeMiB(root)<MIN_FREE_MIB+MAX_JOURNAL_MIB)throw Error("F1_DISK_PREFLIGHT_FAILED");
 const stages=mode==="full"?[10000,50000,100000]:[100,500,1000];
 const start=performance.now(),startSnap=snapshot(),cpu=process.cpuUsage(),payload={
  kind:"PEF_F1_EVENT_V1",data:"X".repeat(1024),priority:"O1"};
 const dir=fs.mkdtempSync(path.join(root,"pef-f1-index-"));
 let journal=null,completed=0,peakRssMiB=startSnap.processRssMiB,error=null;
 const rows=[];
 try{
  journal=createFileJournal({dir,capacityBytes:MAX_JOURNAL_MIB*ONE_MIB,controlReserveBytes:65536});
  for(const target of stages){
   const stageStart=performance.now(),from=completed,latencies=[];
   for(let i=from;i<target;i++){
    if(i%250===0){
     const snap=guard({root,journal,started:start,baseline:startSnap});
     peakRssMiB=Math.max(peakRssMiB,snap.processRssMiB);
    }
    const t=performance.now();
    const res=journal.append({eventId:"f1-"+i,category:"O1",payload});
    if(!res.ack||!res.fsyncCompleted)throw Error("F1_DURABLE_ACK_FAILED:"+i+":"+res.error);
    if(i%20===0)latencies.push(performance.now()-t);
    completed++;
   }
   const writeMs=performance.now()-stageStart,bytes=journal.status().bytesUsed;
   journal.close();journal=null;
   const reopenStart=performance.now();
   journal=createFileJournal({dir,capacityBytes:MAX_JOURNAL_MIB*ONE_MIB,controlReserveBytes:65536});
   const reopenMs=performance.now()-reopenStart;
   if(journal.status().retainedEvents!==target)throw Error("F1_REOPEN_LOST_EVENTS");
   const first=journal.append({eventId:"f1-0",category:"O1",payload});
   const last=journal.append({eventId:"f1-"+(target-1),category:"O1",payload});
   const rejected=journal.append({eventId:"f1-0",category:"O1",payload:{data:"tampered"}});
   if(!first.duplicate||!last.duplicate||rejected.ack||rejected.error!=="EVENT_ID_CONFLICT")
     throw Error("F1_DUPLICATE_OR_CONFLICT_REGRESSION");
   const obs=guard({root,journal,started:start,baseline:startSnap});
   peakRssMiB=Math.max(peakRssMiB,obs.processRssMiB);
   const row={events:target,added:target-from,journalBytes:bytes,bytesPerEvent:Math.round(bytes/target*100)/100,
     writeMs:Math.round(writeMs*100)/100,reopenMs:Math.round(reopenMs*100)/100,
     sampledAppendFsyncP95Ms:percentile(latencies,95),appendLatencySampleRate:"1_in_20",
     nodeRssMiB:obs.processRssMiB,guestMemAvailableMiB:obs.guestMemAvailableMiB,
     cgroupOomKill:obs.cgroup?.events?.oom_kill??null,
     duplicateRetained:true,conflictBlocked:true,readMode:journal.status().reopenReadMode};
   rows.push(row);stageCallback(row);
  }
 }catch(err){error=String(err.message||err);}
 finally{if(journal)journal.close();fs.rmSync(dir,{recursive:true,force:true});}
 const endSnap=snapshot(),cpuUsage=process.cpuUsage(cpu);
 const ok=error===null&&rows.length===stages.length;
 return {kind:"PEF_F1_JOURNAL_INDEX_SCALE_V1",schemaVersion:1,ok,mode,profile,guest,
  status:!ok?"F1_STOPPED_FAIL_CLOSED":mode==="full"?"F1_STAGED_100K_VIRTUAL_PASS":"F1_CI_SMOKE_PASS_NOT_CONSTRAINED",
  completedEvents:completed,stages:rows,error,resource:{
    peakObservedProcessRssMiB:Math.round(peakRssMiB*100)/100,
    endAvailableGuestMiB:endSnap.guestMemAvailableMiB,
    cpuUserMs:Math.round(cpuUsage.user/1000),cpuSystemMs:Math.round(cpuUsage.system/1000),
    durationMs:Math.round((performance.now()-start)*100)/100,
    initialOomKill:startSnap.cgroup?.events?.oom_kill??null,
    finalOomKill:endSnap.cgroup?.events?.oom_kill??null},
  safety:{maxJournalMiB:MAX_JOURNAL_MIB,minFreeMiB:MIN_FREE_MIB,maxRssMiB:MAX_RSS_MIB,
    minGuestAvailableMiB:MIN_GUEST_AVAILABLE_MIB,maxWallMinutes:20,
    usesTemporaryDirectory:true,tempDirectoryDeleted:true,deviceBackend:"BACKEND_NOT_IMPLEMENTED",
    exactly72HoursSimulated:false,full518400EventsTested:false,physicalValidated:false,
    procurementApproved:false}};
}
module.exports={runJournalScale};
