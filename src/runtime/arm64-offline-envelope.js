"use strict";
// E2: 72h capacity model and deliberately BOUNDED real fsync/reopen experiment.
// Never expand journal to 518,400 events or claim 72h on the strength of a small sample.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {performance}=require("node:perf_hooks");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {assessGuest}=require("./arm64-vm-profile.js");
const SECONDS=72*60*60,RATE=2,EVENTS=SECONDS*RATE,MAX=3000,CAPACITY=32*1024*1024;
function modelBacklog({hours=72,rate=2,payloadKiB=1,averageRecordBytes}={}){
 if(!Number.isInteger(hours)||hours<1||hours>168||!Number.isFinite(rate)||rate<=0||rate>50||
    ![1,4].includes(payloadKiB))throw Error("E2_INVALID_MODEL");
 const eventCount=hours*3600*rate;
 const rawPayloadBytes=eventCount*payloadKiB*1024;
 const estimatedJournalBytes=Number.isFinite(averageRecordBytes)&&averageRecordBytes>0?
  Math.ceil(eventCount*averageRecordBytes):null;
 return {hours,eventsPerSecond:rate,eventCount,payloadKiB,
  rawPayloadGiB:Math.round(rawPayloadBytes/(1024**3)*1000)/1000,
  estimatedJournalGiB:estimatedJournalBytes===null?null:Math.round(estimatedJournalBytes/(1024**3)*1000)/1000,
  estimatedJournalBytes,assumesAllEventsStoredWithoutCloudAck:true,projectedNotMeasured:true};
}
async function runOfflineEnvelope({profile="r28s-1g",count=1000,payloadKiB=1,baseDir,requireConstrained=false}={}){
 if(!Number.isSafeInteger(count)||count<1||count>MAX||![1,4].includes(payloadKiB))
  throw Error("E2_BOUNDED_TEST_INVALID");
 const guest=assessGuest({profile});
 if(requireConstrained&&!guest.profileEnforced)throw Error("E2_CONSTRAINED_GUEST_REQUIRED");
 const parent=baseDir||os.tmpdir();
 const space=fs.statfsSync(parent),availableBefore=space.bavail*space.bsize;
 // Reserve ample room for guest OS/metadata; fail closed before writing.
 if(availableBefore<Math.max(256*1024*1024,CAPACITY*5))
   throw Error("E2_DISK_HEADROOM_INSUFFICIENT");
 const dir=fs.mkdtempSync(path.join(parent,"pef-e2-offline-"));
 let journal=null,error=null,acked=0,recovered=0,bytes=0,reopenMs=null;
 let peak=process.memoryUsage().rss;const start=performance.now(),monitor=setInterval(()=>{
  peak=Math.max(peak,process.memoryUsage().rss);
 },10);
 try{
  journal=createFileJournal({dir,capacityBytes:CAPACITY,controlReserveBytes:4096});
  const payload={schemaVersion:1,siteId:"test",deviceId:"r28s-vm",
   payload:"X".repeat(payloadKiB*1024),category:"O1"};
  for(let i=0;i<count;i++){
   const res=journal.append({eventId:"e2-"+i,category:"O1",payload});
   if(!res.ack||!res.fsyncCompleted)throw Error("E2_NOT_DURABLE:"+i+":"+res.error);
   acked++;
   if(i%100===0){peak=Math.max(peak,process.memoryUsage().rss);
    const free=fs.statfsSync(parent);
    if(free.bavail*free.bsize<128*1024*1024)throw Error("E2_DISK_SAFETY_STOP");
   }
  }
  journal.close();journal=null;
  const t=performance.now();
  journal=createFileJournal({dir,capacityBytes:CAPACITY,controlReserveBytes:4096});
  reopenMs=Math.round((performance.now()-t)*100)/100;
  recovered=journal.status().retainedEvents;
  bytes=fs.statSync(journal.file).size;
  if(recovered!==acked)throw Error("E2_REOPEN_LOST_EVENTS");
  const same=journal.append({eventId:"e2-0",category:"O1",payload});
  if(!same.duplicate)throw Error("E2_LOST_IDEMPOTENCY");
 }catch(e){error=String(e.message||e);}
 finally{clearInterval(monitor);if(journal)journal.close();fs.rmSync(dir,{recursive:true,force:true});}
 const measured={eventsAttempted:count,acked,recovered,payloadKiB,journalBytes:bytes,
  bytesPerEvent:acked&&bytes?Math.round(bytes/acked*100)/100:null,
  reopenMs,elapsedMs:Math.round((performance.now()-start)*100)/100,
  sampledPeakProcessRssMiB:Math.round(peak/1048576*100)/100,
  storageLimitBytes:CAPACITY,error};
 const model=modelBacklog({hours:72,rate:2,payloadKiB,averageRecordBytes:measured.bytesPerEvent});
 const safe=error===null&&acked===count&&recovered===count;
 return {kind:"PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1",ok:safe,
  status:safe?"BOUNDED_FSYNC_REOPEN_PASS_72H_NOT_TESTED":"E2_BOUNDED_EXPERIMENT_FAILED",
  profile,guest,model,measured,
  decisions:{projected72h:EVENTS,maxConfiguredLabJournalBytes:100*1024*1024,
    currentJournalUsesWholeFileReadOnReopen:true,requiresMemoryScalingTest:true,
    seventyTwoHourOfflineAcceptance:false},
  limits:{physicalValidated:false,sdCardEnduranceVerified:false,powerCutValidated:false,
   cleanupTemporaryData:true,procurementApproved:false}};
}
module.exports={modelBacklog,runOfflineEnvelope};
