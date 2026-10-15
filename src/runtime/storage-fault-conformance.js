"use strict";
// W1.10.B3: Core local receipt ACK vs host-file failure semantics. All files live in mkdtemp.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {createFaultableFileOps}=require("../adapters/faultable-file-ops.js");
const {createLocalReceipts}=require("../core/local-receipts.js");
const IDENTITY={siteId:"storage-lab",deviceId:"storage-edge",configRevision:"lab-v1"};
function runStorageFaultConformance({tmpParent=os.tmpdir()}={}){
 const checks=[];
 const put=(id,pass,observed)=>checks.push({id,pass:Boolean(pass),observed});
 const dir=fs.mkdtempSync(path.join(tmpParent,"pef-storage-b3-"));
 let j=null;
 const open=(options={})=>{j=createFileJournal({dir,capacityBytes:65536,controlReserveBytes:4096,...options});return j;};
 const close=()=>{if(j){j.close();j=null;}};
 const receive=(id,packageId)=>createLocalReceipts({journal:j,identity:IDENTITY})
   .receive({receiptId:id,packageId});
 const reset=()=>{
   close();fs.rmSync(path.join(dir,"pef-journal.ndjson"),{force:true});
 };
 const expects=(fn,error)=>{try{fn();return false;}catch(e){return e.message===error;}};
 try{
   // Good receipt remains after synthetic ENOSPC; unsafe writer must stop until reopen.
   {
     const faults=createFaultableFileOps();open({fsOps:faults.fsOps});
     const first=receive("B3-BASE","BOX-BASE");
     faults.failNextWrite("enospc");
     const denied=receive("B3-FULL","BOX-FULL"),frozen=receive("B3-NEW","BOX-NEW");
     const unsafe=j.status().unsafe;close();open();
     const retained=j.retained().map(e=>e.eventId),rejectedAbsent=j.retained().every(e=>!e.eventId.endsWith("B3-FULL"));
     put("STORAGE_ENOSPC_FAIL_CLOSED",first.accepted&&!denied.accepted&&
       denied.error==="STORAGE_UNSAFE"&&!frozen.accepted&&unsafe&&rejectedAbsent&&retained.length===1,
       {firstAck:first.accepted,deniedError:denied.error,frozenError:frozen.error,retained:retained.length});
   }
   reset();
   // Real partial file bytes are left untouched and no automatic truncation/repair is attempted.
   {
     const faults=createFaultableFileOps();open({fsOps:faults.fsOps});
     const good=receive("B3-PARTIAL-OK","BOX-OK");
     faults.failNextWrite("partial");
     const bad=receive("B3-PARTIAL-BAD","BOX-BAD");
     const unsafe=j.status().unsafe;close();
     const blocked=expects(()=>open(),"JOURNAL_UNSAFE_TAIL");
     put("STORAGE_PARTIAL_WRITE_QUARANTINE",good.accepted&&!bad.accepted&&
       bad.error==="STORAGE_UNSAFE"&&unsafe&&blocked,
       {goodAck:good.accepted,badAck:bad.accepted,unsafe,reopenRejected:blocked});
   }
   reset();
   // A zero-byte result is not a successful write and produces no false local ACK.
   {
     const faults=createFaultableFileOps();open({fsOps:faults.fsOps});
     faults.failNextWrite("zero");
     const rejected=receive("B3-ZERO","BOX-ZERO"),unsafe=j.status().unsafe;
     close();open();
     put("STORAGE_ZERO_WRITE_NO_ACK",!rejected.accepted&&rejected.error==="STORAGE_UNSAFE"&&
       unsafe&&j.retained().length===0,
       {rejectedError:rejected.error,unsafe,retained:j.retained().length});
   }
   reset();
   // Write can finish then fsync reports failure: outcome remains AMBIGUOUS until restart/replay.
   {
     const faults=createFaultableFileOps();open({fsOps:faults.fsOps});
     faults.failNextFsync();
     const denied=receive("B3-EIO","BOX-EIO"),unsafe=j.status().unsafe;
     close();open();
     const stored=j.retained().length,repeat=receive("B3-EIO","BOX-EIO");
     const conflict=receive("B3-EIO","BOX-CHANGED");
     put("STORAGE_FSYNC_AMBIGUITY_IDEMPOTENT_RECOVERY",!denied.accepted&&
       denied.error==="STORAGE_UNSAFE"&&unsafe&&stored===1&&repeat.accepted&&
       repeat.duplicate===true&&!conflict.accepted&&conflict.error==="EVENT_ID_CONFLICT",
       {firstAccepted:denied.accepted,unsafe,stored,repeatDuplicate:repeat.duplicate,conflict:conflict.error});
   }
   reset();
   // Bounded quota enforces backpressure, but a critical cursor can use reserved bytes.
   {
     open({capacityBytes:4096,controlReserveBytes:1024});
     let accepted=0,full=null;
     for(let i=0;i<100;i++){
       const result=j.append({eventId:"b3-telemetry-"+i,category:"O2",payload:{data:"z".repeat(120)}});
       if(!result.ack){full=result;break;}accepted++;
     }
     const normalUsed=j.status().bytesUsed;
     const ack=j.cloudAck("b3-telemetry-0");
     close();open({capacityBytes:4096,controlReserveBytes:1024});
     put("STORAGE_QUOTA_CONTROL_RESERVE",accepted>1&&full?.error==="STORAGE_FULL_OR_UNSAFE"&&
       full.controlReserveProtected===true&&normalUsed<=3072&&ack.ack&&ack.fsyncCompleted&&
       j.status().cloudAcked===1&&j.status().pending===accepted-1,
       {accepted,limit:3072,usedBeforeControl:normalUsed,full:full?.error,cloudAck:ack.ack});
   }
   reset();
   // Complete newline-terminated record with mutated bytes must fail integrity at boot.
   {
     open();receive("B3-SHA","BOX-ALPHA");const file=j.file;close();
     const original=fs.readFileSync(file,"utf8");
     fs.writeFileSync(file,original.replace("BOX-ALPHA","BOX-OMEGA"));
     const blocked=expects(()=>open(),"JOURNAL_CORRUPT_CHECKSUM");
     put("STORAGE_CHECKSUM_CORRUPTION_BLOCKED",blocked&&original.includes("BOX-ALPHA"),
       {blocked,autoRepaired:false});
   }
   reset();
   // Crash during the next append leaves an unterminated tail: don't make it a valid record.
   {
     open();receive("B3-TAIL","BOX-TAIL");const file=j.file;close();
     fs.appendFileSync(file,'{"kind":"EVENT","id":"unterminated"');
     const blocked=expects(()=>open(),"JOURNAL_UNSAFE_TAIL");
     put("STORAGE_TRUNCATED_TAIL_BLOCKED",blocked,{blocked,autoRepaired:false});
   }
   reset();
   // Interrupted compaction before rename: original inode survives; object stays unsafe.
   {
     open();const original=j.append({eventId:"b3-before",category:"O2",payload:{data:"x".repeat(1024)}});
     j.cloudAck("b3-before");
     const outcome=j.compact({testHook:phase=>{if(phase==="afterStageFsync")throw Error("SIMULATED_POWER_LOSS");}});
     const frozen=j.append({eventId:"b3-later"});close();open();
     const survived=j.cloudAck("b3-before").duplicate===true;
     put("STORAGE_COMPACTION_PRE_RENAME_RECOVERY",original.ack&&outcome.phase==="BEFORE_RENAME"&&
       frozen.error==="STORAGE_UNSAFE"&&survived,
       {phase:outcome.phase,unsafeRejection:frozen.error,survived});
   }
   reset();
   // Post-rename, pre-directory-fsync crash simulation: re-open must verify, not assume.
   {
     open();j.append({eventId:"b3-after",category:"O2",payload:{data:"y".repeat(1024)}});
     j.cloudAck("b3-after");j.append({eventId:"b3-pending",category:"O1",payload:{priority:true}});
     const outcome=j.compact({testHook:phase=>{if(phase==="afterRename")throw Error("SIMULATED_POWER_LOSS");}});
     close();open();
     const duplicate=j.cloudAck("b3-after").duplicate===true,pending=j.pending().map(e=>e.eventId);
     put("STORAGE_COMPACTION_POST_RENAME_RECHECK",outcome.phase==="AFTER_RENAME"&&
       duplicate&&pending.length===1&&pending[0]==="b3-pending",
       {phase:outcome.phase,duplicate,pending});
   }
   reset();
   // Existing unversioned V0 journal records remain readable; compaction explicitly tags V1.
   {
     open();const event=j.append({eventId:"b3-legacy",category:"O1",payload:{migration:true}});
     const file=j.file;close();
     const old=JSON.parse(fs.readFileSync(file,"utf8").trim());
     delete old.recordSchemaVersion;
     fs.writeFileSync(file,JSON.stringify(old)+"\n");
     open();const before=j.status().legacyRecords;
     const compact=j.compact(),after=j.status().legacyRecords;
     const version=JSON.parse(fs.readFileSync(file,"utf8").trim()).recordSchemaVersion;
     const dedup=j.append({eventId:"b3-legacy",category:"O1",payload:{migration:true}}).duplicate===true;
     close();
     put("STORAGE_LEGACY_METADATA_MIGRATION",event.ack&&before===1&&compact.ok&&
       after===0&&version===1&&dedup,
       {legacyBefore:before,legacyAfter:after,version,dedup});
   }
   reset();
   // Explicit newer, unsupported on-disk metadata cannot silently pass through this driver.
   {
     open();j.append({eventId:"b3-future",payload:{schema:true}});
     const file=j.file;close();
     const stored=JSON.parse(fs.readFileSync(file,"utf8").trim());
     stored.recordSchemaVersion=999;
     fs.writeFileSync(file,JSON.stringify(stored)+"\n");
     const blocked=expects(()=>open(),"JOURNAL_SCHEMA_UNSUPPORTED");
     put("STORAGE_FUTURE_SCHEMA_REFUSED",blocked,{blocked,schema:999,physicalValidated:false});
   }
 }catch(e){
   put("STORAGE_CONFORMANCE_UNHANDLED",false,String(e.stack||e));
 }finally{
   close();fs.rmSync(dir,{recursive:true,force:true});
 }
 return checks;
}
module.exports={runStorageFaultConformance};
