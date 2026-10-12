"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process");
const {createFileJournal}=require("../src/emulator/lab/file-journal.js");
function sandbox(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-journal-"));
  try{return fn(dir);}finally{fs.rmSync(dir,{force:true,recursive:true});}
}
test("file journal returns ACK only after host fsync and survives reopen",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  const a=j.append({eventId:"persisted",payload:{serial:1},category:"O1"});
  assert.equal(a.ack,true);assert.equal(a.fsyncCompleted,true);assert.equal(a.physicalPowerCutValidated,false);
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.deepEqual(j.pending().map(x=>x.eventId),["persisted"]);
  assert.equal(j.status().powerCutValidated,false);
  j.close();
}));
test("deduplication does not ACK discordant IDs, even after reload",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.append({eventId:"stable",payload:{v:1}}).ack,true);
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.append({eventId:"stable",payload:{v:1}}).duplicate,true);
  const conflict=j.append({eventId:"stable",payload:{v:2}});
  assert.equal(conflict.ack,false);assert.equal(conflict.error,"EVENT_ID_CONFLICT");
  assert.equal(j.status().events,1);j.close();
}));
test("bounded P1 storage rejects new writes without false ACK",()=>sandbox(dir=>{
  const j=createFileJournal({dir,capacityBytes:256});
  assert.equal(j.append({eventId:"large",payload:{s:"x".repeat(1000)}}).error,"STORAGE_FULL_OR_UNSAFE");
  assert.equal(j.status().events,0);assert.equal(j.status().bytesUsed,0);j.close();
}));
test("cloud ACK is durable and idempotent without deleting critical journal history",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.append({eventId:"q",payload:{a:true}}).ack,true);
  assert.equal(j.cloudAck("q").fsyncCompleted,true);
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.status().cloudAcked,1);assert.equal(j.pending().length,0);
  assert.equal(j.cloudAck("q").duplicate,true);
  assert.equal(j.status().events,1);j.close();
}));
test("corrupted or incomplete log tail fails closed",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  j.append({eventId:"first",payload:{v:1}});const file=j.file;j.close();
  fs.appendFileSync(file,'{"kind":"EVENT"');
  assert.throws(()=>createFileJournal({dir,capacityBytes:65536}),/JOURNAL_UNSAFE_TAIL/);
}));
test("committed file-journal record survives SIGKILL of the owning child process",()=>sandbox(dir=>{
  const result=spawnSync(process.execPath,[path.resolve(__dirname,"../bin/pef-journal-crash-child.js"),dir],{
    encoding:"utf8",timeout:5000});
  assert.match(result.stdout,/FSYNC_ACK/);
  assert.equal(result.signal,"SIGKILL");
  const reopened=createFileJournal({dir,capacityBytes:65536});
  assert.deepEqual(reopened.pending().map(x=>x.eventId),["crash-acked"]);
  reopened.close();
}));

test("control reserve lets a cloud ACK persist after normal event space saturates",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:4096,controlReserveBytes:1024});
  let accepted=0,rejected=null;
  for(let i=0;i<100;i++){
    const res=j.append({eventId:"log-"+i,payload:{message:"m".repeat(120)},category:"O2"});
    if(!res.ack){rejected=res;break;}
    accepted++;
  }
  assert.ok(accepted>1);
  assert.equal(rejected.error,"STORAGE_FULL_OR_UNSAFE");
  assert.equal(rejected.controlReserveProtected,true);
  assert.ok(j.status().bytesUsed<=j.status().regularWriteLimitBytes);
  const ack=j.cloudAck("log-0");
  assert.equal(ack.ack,true);assert.equal(ack.fsyncCompleted,true);
  j.close();j=createFileJournal({dir,capacityBytes:4096,controlReserveBytes:1024});
  assert.equal(j.status().cloudAcked,1);
  assert.equal(j.pending().length,accepted-1);
  j.close();
}));
test("invalid P1 control reserve configuration is rejected",()=>sandbox(dir=>{
  assert.throws(()=>createFileJournal({dir,capacityBytes:4096,controlReserveBytes:4096}),/INVALID_CONTROL_RESERVE/);
  assert.throws(()=>createFileJournal({dir,capacityBytes:4096,controlReserveBytes:-1}),/INVALID_CONTROL_RESERVE/);
}));

test("compaction retains O0/O1 ACKed evidence and pending records, replaces O2/O3 ACKed payload with refs",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536,controlReserveBytes:4096});
  j.append({eventId:"security",payload:{s:"retain"},category:"O0"});
  j.append({eventId:"critical",payload:{s:"retain"},category:"O1"});
  j.append({eventId:"telemetry",payload:{s:"x".repeat(4000)},category:"O2"});
  j.append({eventId:"debug",payload:{s:"y".repeat(4000)},category:"O3"});
  j.append({eventId:"pending",payload:{keep:true},category:"O2"});
  for(const id of ["security","critical","telemetry","debug"])assert.equal(j.cloudAck(id).ack,true);
  const before=j.status().bytesUsed;
  const result=j.compact();
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(result.afterBytes<before);
  assert.equal(result.compactedRefs,2);
  assert.equal(result.retainedCritical,2);
  assert.equal(j.status().pending,1);
  j.close();j=createFileJournal({dir,capacityBytes:65536,controlReserveBytes:4096});
  assert.deepEqual(j.pending().map(x=>x.eventId),["pending"]);
  assert.equal(j.status().cloudAcked,4);
  assert.equal(j.append({eventId:"telemetry",payload:{s:"x".repeat(4000)},category:"O2"}).duplicate,true);
  assert.equal(j.append({eventId:"telemetry",payload:{s:"DIFFERENT"},category:"O2"}).error,"EVENT_ID_CONFLICT");
  assert.equal(j.cloudAck("telemetry").duplicate,true);
  assert.equal(j.cloudAck("security").duplicate,true);
  j.close();
}));
test("compaction interruption before rename retains original ACK and event history",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  j.append({eventId:"x",payload:{big:"x".repeat(4096)},category:"O2"});j.cloudAck("x");
  const result=j.compact({testHook:stage=>{if(stage==="afterStageFsync")throw Error("SIMULATED_ABORT");}});
  assert.equal(result.ok,false);assert.equal(result.phase,"BEFORE_RENAME");
  assert.equal(j.append({eventId:"other"}).error,"STORAGE_UNSAFE");
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.cloudAck("x").duplicate,true);
  assert.equal(j.append({eventId:"x",payload:{big:"x".repeat(4096)},category:"O2"}).duplicate,true);
  j.close();
}));
test("compaction interruption after atomic rename is recoverable without ACK loss",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  j.append({eventId:"x",payload:{big:"x".repeat(4096)},category:"O2"});j.cloudAck("x");
  j.append({eventId:"pending",payload:{keep:true},category:"O1"});
  const result=j.compact({testHook:stage=>{if(stage==="afterRename")throw Error("SIMULATED_ABORT");}});
  assert.equal(result.ok,false);assert.equal(result.phase,"AFTER_RENAME");
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.status().pending,1);
  assert.equal(j.cloudAck("x").duplicate,true);
  assert.equal(j.append({eventId:"x",payload:{big:"changed"},category:"O2"}).error,"EVENT_ID_CONFLICT");
  j.close();
}));
test("safe compaction refuses if staged data exceeds regular P1 budget",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:1024,controlReserveBytes:700});
  j.append({eventId:"large",payload:{s:"a".repeat(60)},category:"O0"});
  j.cloudAck("large");
  const before=j.status().bytesUsed;
  const r=j.compact();
  assert.equal(r.ok,false);assert.equal(r.error,"COMPACTION_NO_SPACE");
  assert.equal(j.status().bytesUsed,before);
  j.close();j=createFileJournal({dir,capacityBytes:1024,controlReserveBytes:700});
  assert.equal(j.status().cloudAcked,1);j.close();
}));
